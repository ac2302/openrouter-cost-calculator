# OpenRouter Cost Tracker and Chat UI

This project is a simple React application built with Vite that provides a user interface for interacting with the OpenRouter API.

## Features

- **API Key Management:** Securely store your OpenRouter API key in your browser's local storage.
- **Model and Provider Selection:** Easily browse and select available models and providers from OpenRouter.
- **Chat Interface:** Engage in conversations with the selected AI model.
- **Cost Tracking:** View the estimated cost of your interactions.
- **Local Chat Saving:** Save and load your chat sessions locally using IndexedDB.
- **Markdown and Code Highlighting:** Messages support markdown formatting and syntax highlighting for code blocks.
- **Theming:** Includes a dark mode option.
- **Responsive Design:** Works on both desktop and mobile devices.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- pnpm (recommended) or npm/yarn

### Installation

1.  Clone the repository:

    ```bash
    git clone <repository-url>
    cd openrouter-cost
    ```

2.  Install dependencies:

    ```bash
    pnpm install
    # or npm install
    # or yarn install
    ```

### Running the Application

1.  Start the development server:

    ```bash
    pnpm dev
    # or npm run dev
    # or yarn dev
    ```

2.  Open your browser to `http://localhost:5173` (or the address shown in your terminal).

## Usage

1.  **Enter your OpenRouter API Key:** Upon first launch, you will be prompted to enter your OpenRouter API key. This key is stored securely in your browser's local storage.
2.  **Select a Model and Provider:** Choose from the available models and providers listed.
3.  **Start Chatting:** Type your message in the input field and press Enter or click the send button.
4.  **Track Costs:** The estimated cost of your conversation will be updated as you exchange messages.
5.  **Save and Load Chats:** Use the sidebar options to save your current chat or load a previously saved session.

## Project Structure

- `public/`: Static assets.
- `src/`: Application source code.
  - `App.jsx`: Main application component containing chat logic, state management, and UI layout.
  - `main.jsx`: Entry point for the React application.
  - `App.css`, `index.css`: Styling.
- `package.json`: Project dependencies and scripts.
- `vite.config.js`: Vite build configuration.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License.
