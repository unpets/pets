# Releases

## Lifecycle

Pushes and pull requests build a preview site and run source, rig, asset, and browser checks.  
Preview sites are available as workflow artifacts.  

Stable releases use tags in the form `vMAJOR.MINOR.PATCH`.  
The tag must match the versions in `pyproject.toml`, `package.json`, and `web/package.json`.  
The release workflow rejects mismatched versions before rendering.  

Each animation state renders from the Blender model in a separate job.  
At most three render jobs run concurrently.  
The packaging job assembles the atlas and exports the editable Blender scene.  
It reopens that scene and checks every baked pose and relative display image reference.  
It also validates the atlas, builds the static site, and runs browser checks.  

The workflow creates a draft release after all checks pass.  
It uploads every package before publishing the release.  
Published releases cannot be overwritten by a workflow rerun.  
Interrupted draft uploads can resume.  

## Packages

| Download | Contents |
| --- | --- |
| `kernel-VERSION-blender.zip` | Editable scene, display sequence, timeline, and verification report |
| `kernel-VERSION-pet.zip` | Sprite sheet, native frames, high-resolution masters, previews, and render manifest |
| `kernel-VERSION-model.zip` | GLB geometry, continuous motion data, and display atlas |
| `kernel-VERSION-site.zip` | Complete static viewer ready for an HTTP server |
| `release.json` | Version, source commit, sizes, and package hashes |
| `SHA256SUMS` | SHA-256 checksums for every release download |

GitHub also provides source archives for the release tag.  
Blender packages retain relative paths to their display images.  
ZIP entries have stable ordering and timestamps.  
Render checksums describe the exact produced bytes.  
Rendering on different hardware is not guaranteed to produce identical image bytes.  

## Prepare a release

Update the three project version fields together.  
Refresh the lockfiles and commit the release changes.  

```sh
uv lock
bun install
uv run python scripts/release.py check --tag v0.3.0
git tag -a v0.3.0 -m 'Kernel 0.3.0'
git push origin v0.3.0
```

Replace the example version with the intended release version.  
The tag starts the complete release workflow.  
A manual **Release Kernel** workflow run builds the same packages for review without publishing.  

## Static site deployment

Production Pages deployment uses the tested site from a published release.  
Development commits do not replace the production site.  

Select **Settings → Pages → Build and deployment → GitHub Actions** to enable deployment.  
Allow release tags in the `github-pages` environment deployment rules.  
The source repository can remain private.  
Pages availability and website visibility depend on the GitHub account plan.  

The release remains downloadable when Pages is unavailable.  
The static site package can also be hosted by another static HTTP server.  
