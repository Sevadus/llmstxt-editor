# LLMS.txt Editor

Get rid of all the stuff you don't need from those [llms.txt](https://llmstxt.org/) files. Don't pay for tokens you're not using!

## Features

- Real-time token counting
- Duplicate section detection (if you don't want "Examples" for every section, just uncheck the box for all "Examples", for example)
- Interactive tree view - Decide what you do/don't want in your documentation
- Export to a new llms.txt file - I sure hope so or what's the point?
- All processing happens locally, I don't want your tokens either

## How it Works

1. Load your llms.txt file via URL or file upload
2. The editor analyzes your content and identifies duplicate sections
3. View token counts for each section to understand their impact
4. Select which sections to keep or remove
5. Export your optimized llms.txt file

## About Tokens

Tokens are the basic units that language models use to process text. Each token represents a piece of text, typically a word or part of a word. The fewer tokens you use, the more efficient and cost-effective your prompts become.

## Development

This project is built with:

- [Astro](https://astro.build)
- [Tailwind CSS](https://tailwindcss.com)
- [TypeScript](https://www.typescriptlang.org/)

### Getting Started

1. Clone the repository:

```bash
git clone https://github.com/sevadus/llmstxt-editor.git
cd llmstxt-editor
```

2. Install dependencies:

```bash
pnpm install
```

3. Start the development server:

```bash
pnpm dev
```

4. Build for production:

```bash
pnpm build
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

Permission is hereby granted, free of charge, to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of this software, and to permit persons to whom the software is furnished to do so, without restriction. In return, if you find this code useful, please do something kind for someone else - that'd be pretty cool.

## Credits

Made with ❤️ by [Matt](https://github.com/sevadus)
