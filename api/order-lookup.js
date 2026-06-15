// api/order-lookup.js

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', 'https://medallion-9178.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { order_id, email } = req.query;

  if (!order_id || !email) {
    return res.status(400).json({ error: 'Order ID and email are required.' });
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

  // ── STEP 2: Look up order ────────────────────────────────────────────────────
  let shopifyData;
  try {
    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-10/orders.json?name=${cleanId}&status=any`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );
    shopifyData = await response.json();
  } catch (err) {
    return res.status(500).json({ error: 'Could not connect to order system. Please try again.' });
  }

  const orders = shopifyData.orders || [];

  if (orders.length === 0) {
    return res.status(404).json({ error: 'Order not found. Please check your order number and try again.' });
  }

  const order = orders[0];

  // ── STEP 3: Verify email ─────────────────────────────────────────────────────
  const orderEmail = (order.email || '').toLowerCase().trim();
  if (orderEmail !== email.toLowerCase().trim()) {
    return res.status(404).json({ error: 'Order not found. Please check your order number and email.' });
  }

  // ── STEP 4: Get product name + FIRST image ───────────────────────────────────
  const firstItem   = order.line_items?.[0];
  const productName = firstItem?.title || 'Watch';

  let imageUrl = '';
  try {
    if (firstItem?.product_id) {
      const prodRes = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2024-10/products/${firstItem.product_id}/images.json?limit=1`,
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );
      const prodData = await prodRes.json();
      console.log('Image fetch response:', JSON.stringify(prodData));  // debug log
      imageUrl = prodData.images?.[0]?.src || '';
    } else {
      console.log('No product_id found on line item:', JSON.stringify(firstItem));
    }
  } catch (e) {
    console.error('Image fetch error:', e);
  }

  return res.status(200).json({
    order_name:   order.name,
    order_date:   order.created_at,
    product_name: productName,
    image_url:    imageUrl
  });
}
