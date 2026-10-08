import React from "react";

/** Decorative only: a fixed, clipped background with no state or event handlers. */
export const AutumnAtmosphere = React.memo(function AutumnAtmosphere() {
  return (
    <div className="autumn-atmosphere" aria-hidden="true">
      <span className="autumn-leaf" />
      <span className="autumn-leaf" />
      <span className="autumn-leaf" />
      <span className="autumn-leaf" />
    </div>
  );
});
