export type Direction = 'up' | 'down' | 'left' | 'right';

export interface FocusNode {
  id: string;
  groupId: string;
  element: HTMLElement | null;
  onEnter?: () => void;
  onBack?: () => void;
  order?: number;
}
