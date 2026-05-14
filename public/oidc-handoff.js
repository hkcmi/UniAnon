const handoff = document.querySelector('#oidcHandoff');
const statusLine = document.querySelector('.status');
const sessionToken = handoff?.dataset.sessionToken || '';

if (sessionToken) {
  localStorage.setItem('unianon:token', sessionToken);
  window.location.replace('/');
} else if (statusLine) {
  statusLine.textContent = 'OIDC sign-in could not be completed.';
}
