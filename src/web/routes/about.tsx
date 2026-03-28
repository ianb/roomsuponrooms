import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";

export const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold">About Rooms Upon Rooms</h1>

      <div className="space-y-4 text-content/70">
        <p>
          Rooms Upon Rooms is an AI-powered text adventure engine. Explore worlds that grow and
          respond as you play — rooms materialize, characters converse, and the world expands
          through a blend of authored content and AI generation.
        </p>

        <p>
          Created by{" "}
          <a href="https://ianbicking.org" className="text-accent hover:text-accent-hover">
            Ian Bicking
          </a>
          .
        </p>

        <div className="flex items-center gap-4">
          <a
            href="https://github.com/ianb/roomsuponrooms"
            className="flex items-center gap-2 text-content/50 hover:text-content/70"
          >
            <GitHubIcon />
            <span>GitHub</span>
          </a>
          <a
            href="https://bsky.app/profile/ianbicking.org"
            className="flex items-center gap-2 text-content/50 hover:text-content/70"
          >
            <BlueSkyIcon />
            <span>Bluesky</span>
          </a>
          <a
            href="https://hachyderm.io/@ianbicking"
            className="flex items-center gap-2 text-content/50 hover:text-content/70"
            // eslint-disable-next-line react/no-invalid-html-attribute -- rel="me" is valid for Mastodon verification
            rel="me"
          >
            <MastodonIcon />
            <span>Mastodon</span>
          </a>
        </div>
      </div>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function BlueSkyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.785 2.627 3.601 3.493 6.19 3.249-4.466.764-8.4 2.626-4.786 9.34C4.049 22.466 7.727 24 11.996 24c4.315 0 7.985-1.488 9.968-1.164 3.614-6.714-.32-8.576-4.786-9.34 2.59.244 5.406-.622 6.19-3.249C23.615 9.418 24 4.458 24 3.768c0-.69-.139-1.861-.902-2.206-.66-.297-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z" />
    </svg>
  );
}

function MastodonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.547c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054 19.648 19.648 0 0 0 4.581.557c.55.004 1.1-.024 1.646-.08 1.856-.19 3.64-.63 5.336-1.31h.014c2.24-.695 4.192-2.862 4.464-5.323l.002-.038c.014-.147.134-1.47.134-1.62 0-.496.146-3.516-.198-5.293zM19.69 13.278h-2.604v-5.62c0-1.18-.477-1.78-1.498-1.78-1.104 0-1.66.712-1.66 2.118v3.069H11.34V8.003c0-1.413-.553-2.126-1.66-2.126-1.02 0-1.498.6-1.498 1.78v5.62H5.587V7.833c0-1.183.302-2.124.906-2.822.624-.698 1.44-1.056 2.454-1.056 1.173 0 2.063.45 2.652 1.35l.572.958.571-.958c.59-.9 1.48-1.35 2.653-1.35 1.013 0 1.83.358 2.454 1.056.604.698.906 1.64.906 2.822v5.445z" />
    </svg>
  );
}
