import { createWatchHandler } from "../src/lib/watchEndpoint.js";

export default {
  fetch: createWatchHandler(process.env),
};
