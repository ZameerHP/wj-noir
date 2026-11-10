const OWNER_EMAIL = 'wjnoir@gmail.com';
const AUTO_RECENT_WINDOW_MS = 30 * 60 * 1000;
const autoSentOrderIds = new Set();

const json = (response, status, body) => {
  response.status(status).setHeader('Cache-Control', 'no-store').json(body);
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatOrderTimestamp = (isoString) => {
  if (!isoString) return 'Just now';
  try {
    return new Date(isoString).toLocaleString('en-PK', {
      timeZone: 'Asia/Karachi',
      dateStyle: 'medium',
      timeStyle: 'short',
    }) + ' PKT';
  } catch (error) {
    return new Date(isoString).toUTCString();
  }
};

const rememberAutoSent = (orderId) => {
  if (autoSentOrderIds.size > 500) {
    autoSentOrderIds.clear();
  }
  autoSentOrderIds.add(orderId);
};

const resolveRecipients = (envAdminEmail) => {
  const normalizedEnv = String(envAdminEmail || '').trim().toLowerCase();
  if (
    normalizedEnv &&
    normalizedEnv !== OWNER_EMAIL &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEnv)
  ) {
    return [OWNER_EMAIL, normalizedEnv];
  }
  return [OWNER_EMAIL];
};

module.exports = async (request, response) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'Method not allowed.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  const fromEmail = process.env.FROM_EMAIL || '';
  const siteUrl = (process.env.SITE_URL || 'https://www.wjnoir.store').replace(/\/$/, '');

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    console.error('New order email environment variables are incomplete.');
    return json(response, 500, { error: 'Owner email service is not fully configured.' });
  }

  try {
    const body = request.body || {};
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
    const orderNumber = typeof body.orderNumber === 'string' ? body.orderNumber.trim() : '';
    const customerEmail = typeof body.customerEmail === 'string' ? body.customerEmail.trim().toLowerCase() : '';
    const mode = body.mode === 'manual' ? 'manual' : 'auto';

    if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
      return json(response, 400, { error: 'A valid order ID is required.' });
    }

    const authorization = request.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    let isVerifiedAdmin = false;

    if (token) {
      if (!supabaseAnonKey) {
        return json(response, 500, { error: 'Supabase anon key is missing for admin verification.' });
      }
      const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
        },
      });
      if (!userResponse.ok) {
        return json(response, 401, { error: 'Your admin session is invalid or expired.' });
      }
      const user = await userResponse.json().catch(() => null);
      if (!user?.email) {
        return json(response, 401, { error: 'Your admin session could not be verified.' });
      }

      const adminCheckResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/is_order_admin`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      if (!adminCheckResponse.ok) {
        return json(response, 403, { error: 'Could not verify admin permission.' });
      }
      const allowed = await adminCheckResponse.json().catch(() => false);
      if (allowed !== true) {
        return json(response, 403, { error: 'This account is not authorized to send order alerts.' });
      }
      isVerifiedAdmin = true;
    } else {
      if (!orderNumber) {
        return json(response, 400, { error: 'Order number is required for order notification.' });
      }
    }

    if (mode === 'auto' && autoSentOrderIds.has(orderId)) {
      return json(response, 200, { sent: true, deduplicated: true });
    }

    const serviceHeaders = {
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    };
    if (serviceRoleKey.split('.').length === 3) {
      serviceHeaders.Authorization = `Bearer ${serviceRoleKey}`;
    }

    const fetchOrderAndItems = async () => {
      const orderQuery = `${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=*`;
      const itemsQuery = `${supabaseUrl}/rest/v1/order_items?order_id=eq.${encodeURIComponent(orderId)}&select=product_name,product_image,size_ml,quantity,unit_price`;

      const [orderResponse, itemsResponse] = await Promise.all([
        fetch(orderQuery, { headers: serviceHeaders }),
        fetch(itemsQuery, { headers: serviceHeaders }),
      ]);
      if (!orderResponse.ok || !itemsResponse.ok) {
        return { errorStatus: 502 };
      }
      const [orders, items] = await Promise.all([orderResponse.json(), itemsResponse.json()]);
      return { order: orders?.[0] || null, items: Array.isArray(items) ? items : [] };
    };

    let fetched = await fetchOrderAndItems();
    if (!fetched.errorStatus && (!fetched.order || fetched.items.length === 0)) {
      await sleep(450);
      fetched = await fetchOrderAndItems();
    }

    if (fetched.errorStatus) {
      console.error('Unable to load order for owner notification.');
      return json(response, 502, { error: 'Could not load order details for owner email.' });
    }

    const { order, items } = fetched;
    if (!order) {
      return json(response, 404, { error: 'Order not found.' });
    }

    if (!isVerifiedAdmin) {
      if (order.order_number !== orderNumber) {
        return json(response, 403, { error: 'Order verification mismatch.' });
      }
      if (customerEmail && String(order.email || '').trim().toLowerCase() !== customerEmail) {
        return json(response, 403, { error: 'Customer verification mismatch.' });
      }
      const ageMs = Date.now() - new Date(order.created_at).getTime();
      if (!Number.isFinite(ageMs) || ageMs > AUTO_RECENT_WINDOW_MS) {
        return json(response, 403, { error: 'Order notification window expired. Trigger manually from admin.' });
      }
    }

    const money = (amount) => `PKR ${Number(amount).toLocaleString('en-PK')}`;
    const fullAddress = [order.address, order.city, order.state, order.postal_code, order.country]
      .filter(Boolean)
      .join(', ');
    const placedAt = formatOrderTimestamp(order.created_at);
    const adminUrl = `${siteUrl}/admin`;
    const logoUrl = `${siteUrl}/assets/wj-noir-logo.png`;

    const itemRowsHtml = items.length
      ? items.map((item) => {
          const quantity = Number(item.quantity);
          const unitPrice = Number(item.unit_price);
          const lineTotal = unitPrice * quantity;
          return `<tr>
            <td style="padding:13px 0;border-bottom:1px solid #e8e5dd;color:#24241f">
              <strong style="font-weight:600">${escapeHtml(item.product_name)}</strong>
              <span style="display:block;font-size:11px;color:#78756d;margin-top:2px">${escapeHtml(item.size_ml)} ml · Eau de Parfum · ${money(unitPrice)} × ${quantity}</span>
            </td>
            <td style="padding:13px 0;border-bottom:1px solid #e8e5dd;text-align:right;white-space:nowrap;color:#24241f;font-weight:600">${money(lineTotal)}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="2" style="padding:13px 0;color:#78756d">Line item details unavailable</td></tr>`;

    const detailRow = (label, valueHtml) => `
      <tr>
        <td style="padding:9px 12px 9px 0;border-bottom:1px solid #eceae2;color:#78756d;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;vertical-align:top;width:150px">${escapeHtml(label)}</td>
        <td style="padding:9px 0;border-bottom:1px solid #eceae2;color:#1b1c19;font-size:13px;line-height:1.5">${valueHtml}</td>
      </tr>`;

    const html = `<!doctype html>
      <html>
      <body style="margin:0;padding:28px 12px;background:#f3f1eb;color:#24241f;font-family:Arial,sans-serif">
        <table role="presentation" style="width:100%;max-width:640px;margin:0 auto;background:#ffffff;border-collapse:collapse;border:1px solid #e2dfd5">
          <tr>
            <td style="padding:28px 36px;text-align:center;background:#10110f">
              <img src="${logoUrl}" width="108" alt="WJ NOIR" style="display:inline-block;width:108px;height:auto"/>
              <p style="margin:12px 0 0;color:#d4b06e;font-size:10px;letter-spacing:3px;font-weight:700">OWNER ORDER NOTIFICATION</p>
            </td>
          </tr>
          <tr>
            <td style="padding:34px 36px">
              <p style="margin:0 0 8px;color:#8b887f;font-size:10px;letter-spacing:2.4px;text-transform:uppercase">NEW ORDER RECEIVED · ${escapeHtml(order.order_number)}</p>
              <h1 style="margin:0 0 12px;font-family:Georgia,serif;font-weight:400;font-size:30px;line-height:1.15;color:#11120f">You have a new order.</h1>
              <p style="margin:0 0 22px;color:#5c5b54;font-size:14px;line-height:1.7">A customer just placed an order on <strong>WJ NOIR</strong> and it has arrived in your Admin Panel. All customer and delivery details are below:</p>

              <table role="presentation" style="width:100%;margin-bottom:24px;background:#faf9f6;border:1px solid #e6e3da;border-collapse:collapse">
                <tr>
                  <td style="padding:16px 20px;border-right:1px solid #e6e3da">
                    <span style="display:block;font-size:10px;letter-spacing:1.6px;color:#78756d;text-transform:uppercase">Order Total</span>
                    <strong style="display:block;font-size:20px;color:#183a2c;margin-top:4px">${money(order.total_amount)}</strong>
                  </td>
                  <td style="padding:16px 20px;border-right:1px solid #e6e3da">
                    <span style="display:block;font-size:10px;letter-spacing:1.6px;color:#78756d;text-transform:uppercase">Status</span>
                    <strong style="display:block;font-size:13px;color:#11120f;text-transform:uppercase;margin-top:6px">${escapeHtml(order.status)}</strong>
                  </td>
                  <td style="padding:16px 20px">
                    <span style="display:block;font-size:10px;letter-spacing:1.6px;color:#78756d;text-transform:uppercase">Placed On</span>
                    <strong style="display:block;font-size:12px;color:#11120f;margin-top:6px">${escapeHtml(placedAt)}</strong>
                  </td>
                </tr>
              </table>

              <h2 style="margin:0 0 10px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#183a2c">Customer &amp; Delivery Details</h2>
              <table role="presentation" style="width:100%;margin-bottom:26px;border-collapse:collapse">
                ${detailRow('Order Number', `<strong>${escapeHtml(order.order_number)}</strong>`)}
                ${detailRow('Customer Name', `<strong>${escapeHtml(order.customer_name)}</strong>`)}
                ${detailRow('Email Address', `<a href="mailto:${escapeHtml(order.email)}" style="color:#183a2c;font-weight:600">${escapeHtml(order.email)}</a>`)}
                ${detailRow('Phone Number', `<a href="tel:${escapeHtml(order.phone)}" style="color:#183a2c;font-weight:600">${escapeHtml(order.phone)}</a>`)}
                ${detailRow('Street Address', escapeHtml(order.address))}
                ${detailRow('City', escapeHtml(order.city))}
                ${detailRow('State / Province', escapeHtml(order.state))}
                ${detailRow('Postal Code', escapeHtml(order.postal_code))}
                ${detailRow('Country', escapeHtml(order.country))}
                ${detailRow('Full Address', escapeHtml(fullAddress))}
                ${detailRow('Payment Method', escapeHtml(order.payment_method))}
                ${detailRow('Customer Notes', order.notes ? `<span style="color:#11120f;background:#fff8e6;padding:3px 7px;display:inline-block">${escapeHtml(order.notes)}</span>` : '<span style="color:#8b887f">None</span>')}
              </table>

              <h2 style="margin:0 0 8px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#183a2c">Ordered Fragrances</h2>
              <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px">
                ${itemRowsHtml}
                <tr>
                  <td style="padding:16px 0 4px;font-weight:700;font-size:14px;color:#11120f">Total · ${escapeHtml(order.payment_method)}</td>
                  <td style="padding:16px 0 4px;text-align:right;font-weight:700;font-size:16px;color:#183a2c;white-space:nowrap">${money(order.total_amount)}</td>
                </tr>
              </table>

              <div style="margin-top:30px;text-align:center">
                <a href="${adminUrl}" style="display:inline-block;padding:14px 28px;background:#183a2c;color:#ffffff;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:2px;border-radius:6px">OPEN ORDER IN ADMIN PANEL ↗</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 36px;background:#f6f5f0;color:#77756d;font-size:11px;text-align:center">WJ NOIR · Owner Notification for ${OWNER_EMAIL}</td>
          </tr>
        </table>
      </body>
      </html>`;

    const textItems = items
      .map((item) => `- ${item.product_name} (${item.size_ml} ml) x ${item.quantity} = ${money(Number(item.unit_price) * Number(item.quantity))}`)
      .join('\n');

    const text = [
      `NEW ORDER RECEIVED: ${order.order_number}`,
      `Status: ${order.status}`,
      `Placed On: ${placedAt}`,
      `Total: ${money(order.total_amount)} (${order.payment_method})`,
      '',
      'CUSTOMER DETAILS:',
      `Name: ${order.customer_name}`,
      `Email: ${order.email}`,
      `Phone: ${order.phone}`,
      `Street Address: ${order.address}`,
      `City: ${order.city}`,
      `State / Province: ${order.state}`,
      `Postal Code: ${order.postal_code}`,
      `Country: ${order.country}`,
      `Notes: ${order.notes || 'None'}`,
      '',
      'ORDERED ITEMS:',
      textItems || '(none)',
      '',
      `Admin Panel: ${adminUrl}`,
    ].join('\n');

    const normalizedFrom = /<[^<>\s]+@[^<>\s]+>|^[^\s<>]+@[^\s<>]+$/.test(fromEmail.trim())
      ? fromEmail.trim()
      : 'WJ NOIR <orders@wjnoir.store>';

    const subject = `New Order ${order.order_number} · ${order.customer_name} · ${money(order.total_amount)}`;
    const recipients = resolveRecipients(adminEmail);

    const idempotencyKey = mode === 'auto'
      ? `owner-new-order-${order.id}`
      : `owner-manual-${order.id}-${Date.now()}`;

    const sendViaResend = async (toList, keySuffix = '') => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `${idempotencyKey}${keySuffix}`,
        },
        body: JSON.stringify({
          from: normalizedFrom,
          to: toList,
          reply_to: order.email,
          subject,
          html,
          text,
        }),
      });
      return res;
    };

    let resendResponse = await sendViaResend(recipients);
    if (!resendResponse.ok && recipients.length > 1 && resendResponse.status === 403) {
      resendResponse = await sendViaResend([OWNER_EMAIL], '-owner');
    }

    if (!resendResponse.ok) {
      const resendError = await resendResponse.json().catch(async () => ({ message: (await resendResponse.text()).slice(0, 500) }));
      const reason = String(resendError?.message || resendError?.name || 'Resend rejected the owner email.').replace(/\s+/g, ' ').trim();
      console.error('Resend rejected owner new-order email.', resendResponse.status, reason);
      return json(response, 502, {
        error: `Resend error ${resendResponse.status}: ${reason}`,
        stage: 'resend',
      });
    }

    if (mode === 'auto') {
      rememberAutoSent(order.id);
    }

    const resendResult = await resendResponse.json().catch(() => ({}));
    return json(response, 200, {
      sent: true,
      to: OWNER_EMAIL,
      orderNumber: order.order_number,
      id: resendResult.id || null,
    });
  } catch (error) {
    console.error('New order owner email failed.', error);
    return json(response, 500, { error: 'Owner order email failed unexpectedly.' });
  }
};
