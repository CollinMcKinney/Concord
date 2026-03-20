const { execSync } = require('child_process');

try {
    console.log('Installing dependencies...');
    execSync('yarn install', { stdio: 'inherit' });

    console.log('Streaming logs...');
    execSync('/app/node_modules/.bin/nodemon --legacy-watch /app/src/server.js', { stdio: 'inherit' });
    
} catch (err) {
    console.error('Error starting services:', err);
    process.exit(1);
}