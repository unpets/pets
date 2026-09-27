# Kernel

A voxel companion with an articulated mechanical rig and a programmable display.  

## Features

Every view is rendered from the same 3D model.  
Deterministic animation drives the joints, expressions, and screen.  
The work animation connects a wrist cable to a small server.  
The web studio provides orbit controls, animation playback, and timeline scrubbing.  

## Architecture

Blender generates the model, rendered sprites, and animation assets.  
Svelte provides the web interface.  
Three.js displays the model.  
Tailwind CSS provides styling, and Lucide provides icons.  
Bun manages the web toolchain.  

## Documentation

[Development](docs/development.md) covers the toolchain, generated assets, and workflows.  
[Releases](docs/releasing.md) covers versioned downloads and static site deployment.  
