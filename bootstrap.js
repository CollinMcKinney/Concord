const { execSync } = require('child_process');

try {
    // Clean everything
    console.log('Cleaning up previous containers, networks, and volumes...');
    execSync('podman compose --file podman-compose.yaml down -v', { stdio: 'inherit' });

    // Start services with build (pulls base image if needed)
    console.log('Starting services...');
    execSync('podman compose --file podman-compose.yaml up -d --build', { stdio: 'inherit' });

    // Commit the Concord container as a local image
    console.log('Committing Concord container to local image "concord:latest"...');
    execSync('podman commit concord concord:latest', { stdio: 'inherit' });

    // Stream logs for live updates
    console.log('Streaming logs...');
    execSync('podman compose --file podman-compose.yaml logs -f', { stdio: 'inherit' });

} catch (err) {
    console.error('Error during full rebuild:', err);
    process.exit(1);
}