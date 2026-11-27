import type { MomentsConfig } from "../types/momentsConfig.ts";
import { withUserConfig } from "../utils/config-overlay.ts";

export const momentsConfig: MomentsConfig = withUserConfig("moments", {
	enable: true,
	title: "谈天说地",
	description: "$t:momentsBanner",
});
