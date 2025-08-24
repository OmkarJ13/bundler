export const defineConfig = (config: Config) => {
  return config;
};

export type Config = {
  entry: string;
  output: string;
  minify?: boolean;
  treeshake?: boolean;
};
