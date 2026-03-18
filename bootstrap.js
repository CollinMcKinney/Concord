const { execSync } = require('child_process');

try {


    console.log('Installing global tools...');
    execSync('npm install -g yarn', { stdio: 'inherit' });
    // execSync('yarn global add pm2', { stdio: 'inherit' });

    console.log('Installing dependencies...');
    execSync('yarn install', { stdio: 'inherit' });

    console.log('Starting services...');
    execSync('podman compose --file podman-compose.yaml up -d', { stdio: 'inherit' });
    console.log('All services started successfully!');

    console.log('Streaming logs...');
    execSync('podman compose --file podman-compose.yaml logs -f', { stdio: 'inherit' });


} catch (err) {
    console.error('Error starting services:', err);
    process.exit(1);
}