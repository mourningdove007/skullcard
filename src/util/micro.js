import { Atom, Bird, ChessKnight, ChessPawn, Coins, Ghost, Heart, Moon, Rose, Skull, Snowflake } from "lucide-svelte";

const iconMap = {
  1: Bird,
  2: Ghost,
  3: Skull,
  4: ChessPawn,
  5: ChessKnight,
  6: Rose,
  7: Atom,
  8: Moon,
};

const themes = {
  Purple: {
    "--primary-color": "#7300FF",
    "--bg-color": "#FFFFFF",
    "--user-color": "#1F51FF",
  },

  Pink: {
    "--primary-color": "#FF10F0",
    "--bg-color": "#1A0018",
    "--user-color": "#10FF20",
  },

  Crimson: {
    "--primary-color": "#DC143C",
    "--bg-color": "#FFE6E6",
    "--user-color": "#14DCB4",
  },

  Gold: {
    "--primary-color": "#FFD700",
    "--bg-color": "#000000",
    "--user-color": "#00FFD9",
  },
};

export const lastTwo = (value) => {
  if (value === null || value === undefined) return "";

  const str = String(value);
  return str.slice(-2);
};

export const lastFour = (value) => {
  if (value === null || value === undefined) return "";

  const str = String(value);
  return str.slice(-4);
};

export const applyTheme = (themeName) => {
  const theme = themes[themeName];
  Object.keys(theme).forEach((variable) => {
    document.documentElement.style.setProperty(variable, theme[variable]);
  });
}


export const getIconFromNumber = (value) => {
  return iconMap[value] ?? Bird;
};



