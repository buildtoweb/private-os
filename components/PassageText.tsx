'use client';
// Renders a passage's light markup: blank-line paragraphs and **bold**.
//
// A markdown library would be overkill — the corpus only ever contains these two
// constructs, and pulling one in for that would cost more than it gives. The
// input is our own generated data, never user input, so there is nothing to
// sanitise beyond the escaping React already does on text nodes.
//
// The 1937 source emphasises by SHOUTING IN CAPS. Those runs were converted to
// bold in the corpus itself rather than at render time, because restoring
// correct German casing needs to know which words are nouns.
import { Fragment } from 'react';

export function PassageText({ text, className, style }: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <>
      {paragraphs.map((para, i) => (
        <p
          key={i}
          className={className}
          style={i === 0 ? style : { ...style, marginTop: '0.9em' }}
        >
          {renderBold(para)}
        </p>
      ))}
    </>
  );
}

function renderBold(para: string) {
  // Split on the ** pairs; odd indices are the emphasised runs.
  const parts = para.split(/\*\*/);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="font-semibold text-primary">{part}</strong>
      : <Fragment key={i}>{part}</Fragment>,
  );
}
