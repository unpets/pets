# Releases

## Release process

**Release Pets** validates, renders, packages, publishes, and deploys a versioned release.  
Push a version change to `main`, run it from GitHub Actions, or push a `vMAJOR.MINOR.PATCH` tag.  
The version must match the Python, Bun workspace, Cargo workspace, and Tauri manifests.  

The source job builds and verifies the canonical Blender scene once.  
Render jobs load that shared artifact and process only their assigned animation state.  
The source job exports shared web assets from the saved scene.  
Desktop jobs consume these assets to build Windows, Linux, and macOS applications.  
The packaging job assembles verified frames and exports the Shimeji image set.  
Content fingerprints and output checksums allow unchanged artifacts to be reused.  
Checks cover baked animation, display references, visibility, generated assets, and the web viewer.  
The publish job uploads the packages and checksums, then publishes the GitHub Release.  
The deploy job publishes the released site to GitHub Pages.  

Each version identifies one source commit and one set of release assets.  
Version tags and published assets are immutable.  
Publish changes under a new version.  

Use **Build Pets studio** for development builds and checks.  

## Prepare a version

Update `pyproject.toml`, every Bun workspace manifest, the root Cargo workspace version, and `apps/desktop/src-tauri/tauri.conf.json`.  
Refresh the lockfiles and validate the version.  

```sh
uv lock
bun install
cargo generate-lockfile
uv run python scripts/release.py check
```

Commit and push the version changes.  
A push containing the version change starts the release workflow.  
The workflow creates the matching tag from the verified build commit.  

Alternatively, create and push the version tag.  

```sh
release_version=$(bun -p "require('./package.json').version")
git tag -a "v${release_version}" -m "Pets ${release_version}"
git push origin "v${release_version}"
```

## Packages

| Download | Contents |
| --- | --- |
| `kernel-VERSION-blender.zip` | Editable scene, display sequence, timeline, verification report, and build record |
| `kernel-VERSION-pet.zip` | Sprite sheet, native frames, high-resolution masters, previews, and render manifest |
| `kernel-VERSION-model.zip` | GLB geometry, continuous motion data, and display atlas |
| `pets-VERSION.html` | Self-contained interactive viewer |
| `pets-VERSION-site.zip` | The same viewer as `index.html` for static hosting |
| `pets-VERSION-pet.html` | Browser companion with mouse tracking |
| `kernel-VERSION-shimeji.zip` | Shimeji-ee compatible character image set |
| `pets-VERSION-windows-x64.exe` | Portable Windows application |
| `pets-VERSION-windows-x64-setup.exe` | Windows installer |
| `pets-VERSION-linux-x64.AppImage` | Portable Linux application |
| `pets-VERSION-linux-x64.deb` | Debian package |
| `pets-VERSION-macos-arm64.zip` | macOS application |
| `release.json` | Version, source commit, package sizes, and hashes |
| `SHA256SUMS` | SHA-256 checksums for the release downloads |

GitHub provides source archives for the release tag.  
Keep the Blender scene and its display image sequence together.  

Verify downloaded packages with their checksums.  

```sh
sha256sum --check SHA256SUMS
```

## Open the viewer

Open `pets-VERSION.html` directly in a browser.  
The file contains the rigged model, all animation clips, textures, scripts, and styles.  
Model and animation downloads work offline.  
For static hosting, extract the site package and deploy `index.html`.  

## Deployment

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.  
Configure the `github-pages` environment to allow release branches and tags.  
The release workflow deploys the same static site distributed in the site package.  
