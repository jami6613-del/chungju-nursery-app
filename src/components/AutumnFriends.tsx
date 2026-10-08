import React from "react";

/** Static, original pixel friends. Every placement belongs to existing empty space. */
export const AutumnFriends = React.memo(function AutumnFriends({
  variant = "friends",
  className = "",
}: {
  variant?: "garden" | "friends" | "rabbit" | "acorn" | "moon";
  className?: string;
}) {
  return <span aria-hidden="true" className={`autumn-friends autumn-friends--${variant} ${className}`} />;
});
