// /pay.js
(function () {
  function qs(id){ return document.getElementById(id); }

  async function startPay() {
    const btn = qs('payBtn');
    const email = qs('email').value.trim();
    const amountStr = qs('amount').value.trim();
    const reference = qs('ref').value.trim() || undefined;

    if (!email || !amountStr) { alert('Please enter email and amount.'); return; }
    const amountZar = Number(amountStr);
    if (Number.isNaN(amountZar) || amountZar <= 0) { alert('Enter a valid amount.'); return; }

    const amountCents = Math.round(amountZar * 100);
    btn.disabled = true; btn.textContent = 'Redirecting…';

    try {
      const res = await fetch('/api/paystack/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          amount: amountCents,
          currency: 'ZAR',
          reference,
          callback_url: `${location.origin}/pay/callback`
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to initialize');

      // Redirect instead of popup
      const url = json?.data?.authorization_url;
      if (!url) throw new Error('No authorization_url returned');
      window.location.href = url;
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not start payment. Please try again.');
      btn.disabled = false; btn.textContent = 'Pay now';
    }
  }

  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  ready(() => qs('payBtn')?.addEventListener('click', startPay));
})();
