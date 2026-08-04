import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';

import './index.css';

function setupFavicon(): void {
  const iconPath =
    '/elive-icon.png';

  const existingIcon =
    document.querySelector<HTMLLinkElement>(
      'link[rel="icon"]'
    );

  if (existingIcon) {
    existingIcon.href =
      iconPath;

    existingIcon.type =
      'image/png';
  } else {
    const favicon =
      document.createElement(
        'link'
      );

    favicon.rel =
      'icon';

    favicon.type =
      'image/png';

    favicon.href =
      iconPath;

    document.head.appendChild(
      favicon
    );
  }

  const existingAppleIcon =
    document.querySelector<HTMLLinkElement>(
      'link[rel="apple-touch-icon"]'
    );

  if (existingAppleIcon) {
    existingAppleIcon.href =
      iconPath;
  } else {
    const appleIcon =
      document.createElement(
        'link'
      );

    appleIcon.rel =
      'apple-touch-icon';

    appleIcon.href =
      iconPath;

    document.head.appendChild(
      appleIcon
    );
  }

  const existingThemeColor =
    document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );

  if (existingThemeColor) {
    existingThemeColor.content =
      '#2563eb';
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

setupFavicon();

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
