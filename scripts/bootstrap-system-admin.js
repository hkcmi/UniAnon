import { config } from '../src/config.js';
import { createStore } from '../src/store.js';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--user-hash') {
      args.userHash = argv[index + 1];
      index += 1;
    } else if (arg === '--nickname') {
      args.nickname = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.userHash && !args.nickname) {
  console.error('Usage: npm run admin:bootstrap -- --user-hash <user_hash>');
  console.error('   or: npm run admin:bootstrap -- --nickname <nickname>');
  process.exit(1);
}

if (!config.databasePath || config.databasePath === ':memory:') {
  console.error('DATABASE_PATH must point to the deployment SQLite database.');
  process.exit(1);
}

const store = createStore();

try {
  const existingAdmins = [...store.users.values()].filter((user) => {
    return !user.banned && user.roles.includes('system_admin');
  });

  if (existingAdmins.length > 0) {
    console.error('A system_admin already exists. Use the in-app multi-party role-management workflow instead.');
    process.exit(1);
  }

  const target = args.userHash
    ? store.users.get(args.userHash)
    : [...store.users.values()].find((user) => user.nickname === args.nickname);

  if (!target) {
    console.error('Target user not found. The user must log in and exist before bootstrap.');
    process.exit(1);
  }

  if (target.banned) {
    console.error('Cannot bootstrap a banned user.');
    process.exit(1);
  }

  const updatedUser = store.setUserRole(
    'bootstrap',
    target.user_hash,
    'system_admin',
    true,
    'initial system admin bootstrap'
  );

  console.log(`Bootstrapped system_admin for ${updatedUser.nickname || updatedUser.user_hash}.`);
  console.log('Use the role-management workflow for all future role changes.');
} finally {
  store.close();
}
