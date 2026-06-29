// api/order-lookup.js

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', 'https://prabhjeetsingh1490.myshopify.com', 'https://dream-watches.com');
  
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { order_id } = req.query;

  if (!order_id) {
    return res.status(400).json({ error: 'Order ID is required.' });
  }

  const cleanId = order_id.replace(/[#\s]/g, '').replace(/^[A-Za-z]+-/, '');

  const SHOPIFY_STORE         = process.env.SHOPIFY_STORE;
  const SHOPIFY_CLIENT_ID     = process.env.SHOPIFY_CLIENT_ID;
  const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

  // ── STEP 1: Get access token ─────────────────────────────────────────────────
  let accessToken;
  try {
    const tokenRes = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        grant_type:    'client_credentials'
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('Token error:', JSON.stringify(tokenData));
      return res.status(500).json({ error: 'Could not authenticate with order system.' });
    }
    accessToken = tokenData.access_token;
  } catch (err) {
    console.error('Token fetch failed:', err);
    return res.status(500).json({ error: 'Could not connect to order system. Please try again.' });
  }

  // ── STEP 2: Fetch order ──────────────────────────────────────────────────────
  let order;
  try {
    const res2 = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-10/orders.json?name=${cleanId}&status=any`,
      { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } }
    );
    const data = await res2.json();
    const orders = data.orders || [];
    if (orders.length === 0) {
      return res.status(404).json({ error: 'Order not found. Please check your order number and try again.' });
    }
    order = orders[0];
  } catch (err) {
    return res.status(500).json({ error: 'Could not connect to order system. Please try again.' });
  }

  // ── STEP 3: Fetch all fulfillments ───────────────────────────────────────────
  let fulfillments = [];
  try {
    const fulRes = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-10/orders/${order.id}/fulfillments.json`,
      { headers: { 'X-Shopify-Access-Token': accessToken } }
    );
    const fulData = await fulRes.json();
    fulfillments = fulData.fulfillments || [];
  } catch (e) {
    console.error('Fulfillment fetch error:', e);
  }

  // Build a map: line_item_id → fulfillment info
  const lineItemFulfillmentMap = {};
  for (const ful of fulfillments) {
    for (const item of (ful.line_items || [])) {
      lineItemFulfillmentMap[item.id] = {
        fulfilled_at:     ful.created_at      || '',
        tracking_number:  ful.tracking_number  || '',
        tracking_company: ful.tracking_company || '',
        tracking_url:     ful.tracking_url     || '',
      };
    }
  }

  // ── STEP 4: Order-level preorder tag check ────────────────────────────────────
  const orderTags = (order.tags || '').split(',').map(t => t.trim().toUpperCase());
  const orderHasPreorderTag = orderTags.includes('PREORDER');
  const orderCreatedAt = new Date(order.created_at);
  const orderAgeHours  = (Date.now() - orderCreatedAt.getTime()) / (1000 * 60 * 60);

  // ── STEP 5: Process each line item ───────────────────────────────────────────
  const lineItems = order.line_items || [];

  // Fetch product images + tags for all unique product IDs in parallel
  const uniqueProductIds = [...new Set(lineItems.map(i => i.product_id).filter(Boolean))];
  const productDataMap = {};

  await Promise.all(uniqueProductIds.map(async (pid) => {
    try {
      const [imgRes, prodRes] = await Promise.all([
        fetch(`https://${SHOPIFY_STORE}/admin/api/2024-10/products/${pid}/images.json?limit=1`,
          { headers: { 'X-Shopify-Access-Token': accessToken } }),
        fetch(`https://${SHOPIFY_STORE}/admin/api/2024-10/products/${pid}.json`,
          { headers: { 'X-Shopify-Access-Token': accessToken } })
      ]);
      const imgData  = await imgRes.json();
      const prodData = await prodRes.json();
      const product  = prodData.product || {};
      const prodTags = (product.tags || '').split(',').map(t => t.trim().toUpperCase());

      productDataMap[pid] = {
        image_url:          imgData.images?.[0]?.src || '',
        has_preorder_tag:   prodTags.includes('PREORDER'),
      };
    } catch (e) {
      console.error('Product fetch error for', pid, e);
      productDataMap[pid] = { image_url: '', has_preorder_tag: false };
    }
  }));

  // ── STEP 6: Build per-product result ─────────────────────────────────────────
  const products = lineItems.map(item => {
    const pid         = item.product_id;
    const pdata       = productDataMap[pid] || {};
    const fulfillment = lineItemFulfillmentMap[item.id] || null;

    const isFulfilled   = !!fulfillment;
    const fulfilledAt   = fulfillment?.fulfilled_at || null;

    // Preorder detection:
    // 1. Order has PREORDER tag
    // 2. Product has PREORDER tag
    // 3. Item is unfulfilled after 48hrs
    // 4. Item was fulfilled but took more than 48hrs from order date
    let isPreorder = false;
    if (orderHasPreorderTag || pdata.has_preorder_tag) {
      isPreorder = true;
    } else if (!isFulfilled && orderAgeHours >= 48) {
      isPreorder = true;
    } else if (isFulfilled && fulfilledAt) {
      const hoursTilFulfilled = (new Date(fulfilledAt) - orderCreatedAt) / (1000 * 60 * 60);
      if (hoursTilFulfilled >= 48) isPreorder = true;
    }

    // Est delivery:
    // Normal: 5 days from fulfilled_at
    // Preorder: 30 days from order date OR 5 days from fulfilled_at if already fulfilled
    let estDelivery = null;
    if (!isPreorder && isFulfilled && fulfilledAt) {
      estDelivery = new Date(new Date(fulfilledAt).getTime() + 5 * 86400000).toISOString();
    } else if (isPreorder && isFulfilled && fulfilledAt) {
      estDelivery = new Date(new Date(fulfilledAt).getTime() + 5 * 86400000).toISOString();
    } else {
      estDelivery = new Date(orderCreatedAt.getTime() + 30 * 86400000).toISOString();
    }

    return {
      title:            item.title || 'Watch',
      image_url:        pdata.image_url || '',
      is_preorder:      isPreorder,
      is_fulfilled:     isFulfilled,
      fulfilled_at:     fulfilledAt,
      tracking_number:  fulfillment?.tracking_number  || '',
      tracking_company: fulfillment?.tracking_company || '',
      tracking_url:     fulfillment?.tracking_url     || '',
      est_delivery:     estDelivery,
    };
  });

  // Sort: normal orders first, preorders below
  products.sort((a, b) => {
    if (a.is_preorder === b.is_preorder) return 0;
    return a.is_preorder ? 1 : -1;
  });

  return res.status(200).json({
    order_name:    order.name,
    order_date:    order.created_at,
    cancelled_at:  order.cancelled_at || null,
    age_hours:     Math.floor(orderAgeHours),
    products,
  });
}
