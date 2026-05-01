import { createStore } from '../src/store.js';
import { seedDemoData } from '../src/seed-demo.js';

const store = createStore();
const result = seedDemoData(store);
store.close();

console.log('Demo data seeded.');
console.log('');
console.log('Use these emails in the local login screen:');
console.log('- moderator@example.edu / demo_moderator / trust 3 / moderator');
console.log('- juror@example.edu / demo_juror / trust 2');
console.log('- reporter@example.edu / demo_reporter / trust 2');
console.log('- member@example.edu / demo_member / trust 1');
console.log('- accused@example.edu / demo_accused / trust 0');
console.log('- org-member@example.org / demo_org_member / trust 1');
console.log('');
console.log(`Seeded public post: ${result.posts.welcome.id}`);
console.log(`Seeded governance case: ${result.case.id}`);
