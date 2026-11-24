export type Theme = {
  id: string;
  name: string;
  note: string;
  paper: string;
  paperShade: string; // mottling / foxing tone
  ink: string;
  accent: string;
  /** 'multiply' for ink on light paper, 'source-over' for light ink on dark paper */
  blend: GlobalCompositeOperation;
};

export const THEMES: Theme[] = [
  {
    id: 'observatory',
    name: 'Observatory',
    note: 'cream · indigo · vermilion',
    paper: '#efe6d2',
    paperShade: '#d9c9a6',
    ink: '#1f2a5c',
    accent: '#d9432b',
    blend: 'multiply',
  },
  {
    id: 'archive',
    name: 'Archive',
    note: 'oatmeal · bistre · gold',
    paper: '#ece3cf',
    paperShade: '#cdb98f',
    ink: '#2e241f',
    accent: '#b8862b',
    blend: 'multiply',
  },
  {
    id: 'nocturne',
    name: 'Nocturne',
    note: 'indigo · bone · gold',
    paper: '#1c2350',
    paperShade: '#0f1538',
    ink: '#ede3cb',
    accent: '#e0ad45',
    blend: 'source-over',
  },
];

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];
