// auth.js

document.addEventListener('DOMContentLoaded', () => {
  const signInForm  = document.getElementById('signin-form');
  const signUpForm  = document.getElementById('signup-form');
  const signInError = document.getElementById('signin-error');
  const signUpError = document.getElementById('signup-error');

  // Helper to send JSON requests
  async function postJSON(url, payload) {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data;
  }

  // SIGN IN
  if (signInForm) {
    signInForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      signInError.textContent = '';

      const email    = signInForm.email.value.trim();
      const password = signInForm.password.value;

      try {
        const { token } = await postJSON('/api/auth/signin', { email, password });
        localStorage.setItem('token', token);
        window.location.href = '/';
      } catch (err) {
        signInError.textContent = err.message;
      }
    });
  }

  // SIGN UP
  if (signUpForm) {
    signUpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      signUpError.textContent = '';

      const name            = signUpForm.name.value.trim();
      const email           = signUpForm.email.value.trim();
      const password        = signUpForm.password.value;
      const confirmPassword = signUpForm['confirm-password'].value;

      if (password !== confirmPassword) {
        signUpError.textContent = 'Passwords do not match.';
        return;
      }

      try {
        const { token } = await postJSON('/api/auth/signup', { name, email, password });
        localStorage.setItem('token', token);
        window.location.href = '/';
      } catch (err) {
        signUpError.textContent = err.message;
      }
    });
  }
});
