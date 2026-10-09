import React from 'react';

export default function SiteHeader() {
  return (
    <header className="site-header">
      <a className="title" href="https://theoazriel.com/" aria-label="Theo Azriel home">
        <ink-mark class="site-mark" aria-hidden="true" data-ink-state="static">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="96" height="96" />
          <canvas width="192" height="192" />
        </ink-mark>
        <span>Theo Azriel</span>
      </a>
    </header>
  );
}
