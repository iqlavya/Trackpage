// ─────────────────────────────────────────────────────────────────────────────
// api/order-lookup.js
// Deploy this as a Vercel Serverless Function (free)
//
// This is the backend that:
//   1. Receives order_id + email from the tracking page
//   2. Uses your app's Client ID + Client Secret to get a temporary
//      access token from Shopify (Client Credentials Grant)
//   3. Calls Shopify Admin API to find the order using that token
//   4. Verifies the email matches (security)
//   5. Returns order date, name, product title & image
//
// WHY THIS APPROACH:
//   Shopify removed the old "generate a permanent token" option for
//   new custom apps. Apps now get a Client ID + Client Secret instead.
//   For apps you install on your OWN store, you can exchange these
//   for an access token yourself — no OAuth redirect/login needed.
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {

  // Allow your Shopify store to call this
  res.setHeader('Access-Control-Allow-Origin', 'https://YOUR-STORE.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { order_id, email } = req.query;

  if (!order_id || !email) {
    return res.status(400).json({ error: 'Order ID and email are required.' });
  }

  // Clean up order ID — strip # signs, spaces, common prefixes
  const cleanId = order_id.replace(/[#\s]/g, '').replace(/^[A-Za-z]+-/, '');

  const SHOPIFY_STORE        = process.env.SHOPIFY_STORE;        // yourstore.myshopify.com
  const SHOPIFY_CLIENT_ID    = process.env.SHOPIFY_CLIENT_ID;     // from Dev Dashboard → Settings
  const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET; // from Dev Dashboard → Settings

  // ── STEP 1: Get a temporary access token using Client Credentials Grant ─────
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
      console.error('Token error:', tokenData);
      return res.status(500).json({ error: 'Could not authenticate with order system. Please contact support.' });
    }

    accessToken = tokenData.access_token;
  } catch (err) {
    console.error('Token fetch failed:', err);
    return res.status(500).json({ error: 'Could not connect to order system. Please try again.' });
  }

  // ── STEP 2: Use the access token to look up the order ────────────────────────
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

  // ── STEP 3: Security check — verify email matches ────────────────────────────
  const orderEmail = (order.email || '').toLowerCase().trim();
  if (orderEmail !== email.toLowerCase().trim()) {
    return res.status(404).json({ error: 'Order not found. Please check your order number and email.' });
  }

  // ── STEP 4: Build response ────────────────────────────────────────────────────
  const firstItem    = order.line_items?.[0];
  const productName  = firstItem?.title || 'Watch';

  // Get product image via a second lightweight call (line item doesn't include image directly)
  let imageUrl = '';
  try {
    if (firstItem?.product_id) {
      const prodRes = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2024-10/products/${firstItem.product_id}/images.json`,
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );
      const prodData = await prodRes.json();
      imageUrl = prodData.images?.[0]?.src || '';
    }
  } catch (e) {
    // Non-critical — just skip image if this fails
  }

  return res.status(200).json({
    order_name:   order.name,
    order_date:   order.created_at,
    product_name: productName,
    image_url:    imageUrl
  });
}
