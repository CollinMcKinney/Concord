const { execSync, spawn } = require('child_process');

try {
    const fs = require("fs");
    const path = require("path");

    const envPath = path.resolve(process.cwd(), ".env");
    const examplePath = path.resolve(process.cwd(), ".env.example");

    try {
        // Check if .env already exists
        if (fs.existsSync(envPath))
            console.log(".env file found");
        else {
            // Check if .env.example exists
            if (!fs.existsSync(examplePath)) {
                console.error("No .env.example found. Cannot create .env");
                process.exit(1);
            }
            // Copy .env.example → .env
            fs.copyFileSync(examplePath, envPath);
            console.log("Created .env from .env.example");
        }
    } catch (err) {
        console.error("Error handling .env file:", err);
        process.exit(1);
    }

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
