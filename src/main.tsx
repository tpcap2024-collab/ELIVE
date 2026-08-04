import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';

import './index.css';

function setupBrowserIcon(): void {
  const iconUrl =
    '/elive-icon-v2.png?v=2';

  const oldIcons =
    document.head.querySelectorAll(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
    );

  oldIcons.forEach(
    icon => {
      icon.remove();
    }
  );

  const favicon =
    document.createElement(
      'link'
    );

  favicon.rel =
    'icon';

  favicon.type =
    'image/png';

  favicon.sizes =
    'any';

  favicon.href =
    iconUrl;

  document.head.appendChild(
    favicon
  );

  const shortcutIcon =
    document.createElement(
      'link'
    );

  shortcutIcon.rel =
    'shortcut icon';

  shortcutIcon.type =
    'image/png';

  shortcutIcon.href =
    iconUrl;

  document.head.appendChild(
    shortcutIcon
  );

  const appleTouchIcon =
    document.createElement(
      'link'
    );

  appleTouchIcon.rel =
    'apple-touch-icon';

  appleTouchIcon.href =
    iconUrl;

  document.head.appendChild(
    appleTouchIcon
  );

  const existingThemeColor =
    document.head.querySelector(
      'meta[name="theme-color"]'
    );

  if (existingThemeColor) {
    existingThemeColor.setAttribute(
      'content',
      '#2563eb'
    );
  } else {
    const themeColor =
      document.createElement(
        'meta'
      );

    themeColor.name =
      'theme-color';

    themeColor.content =
      '#2563eb';

    document.head.appendChild(
      themeColor
    );
  }

  document.title =
    'ELIVE Dashboard';
}

setupBrowserIcon();

const rootElement =
  document.getElementById(
    'root'
  );

if (!rootElement) {
  throw new Error(
    'Root element was not found.'
  );
}

ReactDOM
  .createRoot(
    rootElement
  )
  .render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
