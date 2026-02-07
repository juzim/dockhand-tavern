// Quick test to verify URL handling
const testLabel = 'http://192.168.178.7:81';
console.log('Input:', testLabel);
console.log('Output:', testLabel); // Should be unchanged

// Test escapeHtml function
function escapeHtml(str) {
  const div = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (char) => div[char]);
}

console.log('After escapeHtml:', escapeHtml(testLabel));
