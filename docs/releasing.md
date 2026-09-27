# Releases

## Release process

**Release Kernel** validates, renders, packages, publishes, and deploys a versioned release.  
Start it manually from GitHub Actions or push a `vMAJOR.MINOR.PATCH` tag.  
The version must match `pyproject.toml`, `package.json`, and `web/package.json`.  

The source job builds and verifies the canonical Blender scene once.  
Render jobs load that shared artifact and process only their assigned animation state.  
The packaging job assembles verified frames and exports the web assets from the saved scene.  
Content fingerprints and output checksums allow unchanged artifacts to be reused.  
Checks cover baked animation, display references, visibility, generated assets, and the web viewer.  
The publish job uploads the packages and checksums, then publishes the GitHub Release.  
The deploy job publishes the released site to GitHub Pages.  

Each version identifies one source commit and one set of release assets.  
Version tags and published assets are immutable.  
Publish changes under a new version.  

Use **Build Kernel model studio** for development builds and checks.  

## Prepare a version

Update the version in all three project manifests.  
Refresh the lockfiles and validate the version.  

```sh
uv lock
bun install
uv run python scripts/release.py check
```

Commit and push the version changes.  
Open **Actions → Release Kernel → Run workflow** and select the release branch.  
The workflow creates the matching tag from the verified build commit.  

Alternatively, create and push the version tag.  

```sh
release_version=$(bun -p "require('./package.json').version")
git tag -a "v${release_version}" -m "Kernel ${release_version}"
git push origin "v${release_version}"
```

## Packages

| Download | Contents |
| --- | --- |
| `kernel-VERSION-blender.zip` | Editable scene, display sequence, timeline, and verification report |
| `kernel-VERSION-pet.zip` | Sprite sheet, native frames, high-resolution masters, previews, and render manifest |
| `kernel-VERSION-model.zip` | GLB geometry, continuous motion data, and display atlas |
| `kernel-VERSION.html` | Self-contained interactive viewer |
| `kernel-VERSION-site.zip` | The same viewer as `index.html` for static hosting |
| `release.json` | Version, source commit, package sizes, and hashes |
| `SHA256SUMS` | SHA-256 checksums for the release downloads |

GitHub provides source archives for the release tag.  
Keep the Blender scene and its display image sequence together.  

Verify downloaded packages with their checksums.  

```sh
sha256sum --check SHA256SUMS
```

## Open the viewer

Open `kernel-VERSION.html` directly in a browser.  
The file contains the rigged model, all animation clips, textures, scripts, and styles.  
Model and animation downloads work offline.  
For static hosting, extract the site package and deploy `index.html`.  

## Deployment

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.  
Configure the `github-pages` environment to allow release branches and tags.  
The release workflow deploys the same static site distributed in the site package.  
