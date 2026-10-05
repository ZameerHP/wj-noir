const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

Deno.serve(async request => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('authorization');
  if (!serviceRoleKey || authorization !== `Bearer ${serviceRoleKey}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const adminEmail = Deno.env.get('ADMIN_EMAIL');
  const fromEmail = Deno.env.get('FROM_EMAIL');
  if (!supabaseUrl || !resendApiKey || !adminEmail || !fromEmail) {
    console.error('Order email function secrets are incomplete.');
    return Response.json({ error: 'Email service is not configured.' }, { status: 500 });
  }

  try {
    const payload = await request.json();
    const orderId = payload?.record?.id;
    if (typeof orderId !== 'string' || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return Response.json({ error: 'Invalid order notification.' }, { status: 400 });
    }

    const restHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    };
    const [orderResponse, itemsResponse] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=*`, { headers: restHeaders }),
      fetch(`${supabaseUrl}/rest/v1/order_items?order_id=eq.${encodeURIComponent(orderId)}&select=product_name,product_image,size_ml,quantity,unit_price`, { headers: restHeaders }),
    ]);
    if (!orderResponse.ok || !itemsResponse.ok) {
      throw new Error(`Could not load order details (${orderResponse.status}/${itemsResponse.status}).`);
    }
    const [orders, items] = await Promise.all([orderResponse.json(), itemsResponse.json()]);
    const order = orders[0];
    if (!order || !Array.isArray(items) || items.length === 0) {
      throw new Error('The new order or its line items could not be found.');
    }

    const money = (amount: number) => `PKR ${Number(amount).toLocaleString('en-PK')}`;
    const address = [order.address, order.city, order.state, order.postal_code, order.country].filter(Boolean).join(', ');
    const itemRows = items.map((item: Record<string, unknown>) => {
      const quantity = Number(item.quantity);
      const lineTotal = Number(item.unit_price) * quantity;
      return `<tr><td style="padding:14px 0;border-bottom:1px solid #e8e5dd">${escapeHtml(item.product_name)} · ${escapeHtml(item.size_ml)} ml × ${quantity}</td><td style="padding:14px 0;border-bottom:1px solid #e8e5dd;text-align:right;white-space:nowrap">${money(lineTotal)}</td></tr>`;
    }).join('');
    const logoUrl = `${(Deno.env.get('SITE_URL') || 'https://raw.githubusercontent.com/ZameerHP/wj-noir/main').replace(/\/$/, '')}/assets/wj-noir-logo.png`;
    const emailFrame = (title: string, contents: string) => `<!doctype html><html><body style="margin:0;padding:32px 12px;background:#f3f1eb;color:#24241f;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;max-width:620px;margin:0 auto;background:#fff"><tr><td style="padding:34px 38px;text-align:center;background:#10110f"><img src="${logoUrl}" width="112" alt="WJ NOIR" style="display:inline-block;width:112px;height:auto"/><p style="margin:16px 0 0;color:#d7d2c5;font-size:10px;letter-spacing:4px">WJ NOIR</p></td></tr><tr><td style="padding:38px">${contents}</td></tr><tr><td style="padding:20px 38px;background:#f6f5f0;color:#76766e;font-size:11px;line-height:1.7">WJ NOIR · Three distinct signatures. One fragrance house.</td></tr></table></body></html>`;
    const customerHtml = emailFrame('Thank you for your order', `
      <p style="margin:0 0 10px;color:#77766e;font-size:10px;letter-spacing:2px">ORDER ${escapeHtml(order.order_number)}</p>
      <h1 style="margin:0 0 15px;font-family:Georgia,serif;font-weight:400;font-size:32px">Thank you for your order.</h1>
      <p style="color:#66665e;font-size:14px;line-height:1.7">Hello ${escapeHtml(order.customer_name)}, we have received your order. Our team will contact you soon to confirm delivery.</p>
      <table role="presentation" style="width:100%;margin-top:26px;border-collapse:collapse;font-size:13px">${itemRows}<tr><td style="padding:18px 0;font-weight:bold">Total · Cash on Delivery</td><td style="padding:18px 0;text-align:right;font-weight:bold;white-space:nowrap">${money(Number(order.total_amount))}</td></tr></table>
      <p style="margin:26px 0 0;color:#66665e;font-size:12px;line-height:1.8"><strong>Delivery address</strong><br/>${escapeHtml(address)}<br/><br/><strong>Order number</strong><br/>${escapeHtml(order.order_number)}</p>
    `);
    const adminHtml = emailFrame('New Order Received', `
      <p style="margin:0 0 10px;color:#77766e;font-size:10px;letter-spacing:2px">NEW ORDER</p>
      <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-weight:400;font-size:32px">New Order Received</h1>
      <p style="color:#66665e;font-size:13px;line-height:1.8"><strong>Order:</strong> ${escapeHtml(order.order_number)}<br/><strong>Name:</strong> ${escapeHtml(order.customer_name)}<br/><strong>Email:</strong> ${escapeHtml(order.email)}<br/><strong>Phone:</strong> ${escapeHtml(order.phone)}<br/><strong>Address:</strong> ${escapeHtml(address)}<br/><strong>Payment:</strong> ${escapeHtml(order.payment_method)}${order.notes ? `<br/><strong>Notes:</strong> ${escapeHtml(order.notes)}` : ''}</p>
      <table role="presentation" style="width:100%;margin-top:20px;border-collapse:collapse;font-size:13px">${itemRows}<tr><td style="padding:18px 0;font-weight:bold">Total</td><td style="padding:18px 0;text-align:right;font-weight:bold">${money(Number(order.total_amount))}</td></tr></table>
    `);

    const sendEmail = async (to: string, subject: string, html: string) => {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromEmail, to: [to], subject, html }),
      });
      if (!response.ok) throw new Error(`Resend rejected ${subject} (${response.status}): ${await response.text()}`);
    };
    const results = await Promise.allSettled([
      sendEmail(order.email, `WJ NOIR order ${order.order_number} confirmed`, customerHtml),
      sendEmail(adminEmail, `New Order Received · ${order.order_number}`, adminHtml),
    ]);
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) {
      failures.forEach(result => {
        if (result.status === 'rejected') console.error('Order email delivery failed.', result.reason);
      });
      return Response.json({ error: 'One or more order emails could not be delivered.' }, { status: 502 });
    }
    return Response.json({ sent: true });
  } catch (error) {
    console.error('Unable to send new-order emails.', error);
    return Response.json({ error: 'Order email processing failed.' }, { status: 500 });
  }
});
