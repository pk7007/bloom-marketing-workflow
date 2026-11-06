import { emptyState, type State } from "./domain";
export function demoState(): State {
  const s = emptyState();
  s.brand = {
    name: "Studio Bloom",
    description: "Thoughtful essentials for everyday living.",
    audience: "People who value intentional design and a slower pace.",
    tone: "Warm, thoughtful, quietly confident",
    facts: "Responsibly sourced materials. Designed for everyday use.",
    prohibited: "No unverified sustainability or health claims.",
    timezone: "Asia/Kolkata",
  };
  const ideas = [
    [
      "A little room to slow down",
      "Introduce our everyday ceramics collection.",
      "instagram",
      "in_review",
      "ceramics",
    ],
    [
      "Good things, made for everyday",
      "Share the story behind our latest collection.",
      "facebook",
      "approved",
      "chair",
    ],
    [
      "Your weekend, a little softer",
      "Announce our weekend collection edit.",
      "instagram",
      "draft",
      "linen",
    ],
    [
      "Objects with a story",
      "Show the details that make our pieces special.",
      "facebook",
      "draft",
      "vase",
    ],
  ] as const;
  for (const [title, brief, platform, status, image] of ideas) {
    const id = crypto.randomUUID(),
      vid = crypto.randomUUID();
    s.contents.push({
      id,
      title,
      brief,
      platform,
      status,
      approvedVersion: status === "approved" ? vid : null,
      createdAt: new Date().toISOString(),
      comments: [],
      versions: [
        {
          id: vid,
          caption: `${title}.\n\nThoughtfully chosen pieces for the moments that matter. Explore the collection and find your everyday favourite.\n\n#StudioBloom #EverydayDesign`,
          asset: {
            id: crypto.randomUUID(),
            path: `demo/${image}.svg`,
            url: `/samples/${image}.svg`,
            width: 1080,
            height: 1080,
            bytes: 12000,
            mime: "image/jpeg",
          },
          createdAt: new Date().toISOString(),
          author: "alex@example.com",
        },
      ],
    });
  }
  s.connections = [
    {
      platform: "instagram",
      accountId: "demo-ig",
      name: "@studiobloom",
      status: "connected",
    },
    {
      platform: "facebook",
      accountId: "demo-fb",
      name: "Studio Bloom",
      status: "connected",
    },
  ];
  return s;
}
