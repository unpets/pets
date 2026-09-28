export interface StudioMenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  hint?: string;
}

export interface StudioMenu {
  id: string;
  label: string;
  groups: StudioMenuItem[][];
}
