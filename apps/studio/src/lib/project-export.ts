import { exportAsset } from '@pets/three-runtime/assets';
import { download, downloadJson } from './files';
import { standaloneHtml, type StudioProject } from './studio-project';

export type ProjectExport =
  | 'project'
  | 'animation'
  | 'screen'
  | 'composition'
  | 'component'
  | 'clip'
  | 'html'
  | 'pet';

export function saveProject(project: StudioProject, kind: ProjectExport) {
  const { selection } = project;
  if (kind === 'project')
    downloadJson(`${project.persona.id}.pets.json`, project);
  else if (kind === 'animation')
    downloadJson('pets-animation.json', project.animations);
  else if (kind === 'screen')
    downloadJson('kernel-screen.json', project.screen);
  else if (kind === 'html' || kind === 'pet')
    download(
      `${project.persona.id}-${kind === 'pet' ? 'pet' : 'studio'}.html`,
      standaloneHtml(project, kind === 'pet'),
      'text/html',
    );
  else
    downloadJson(
      `${selection[kind].replaceAll('/', '-')}.pets-asset.json`,
      exportAsset(project.animations, kind, selection[kind]),
    );
}
