export const PROMPT_TEMPLATES = [
  {
    id: "cinematic-portrait",
    title: "Cinematic portrait",
    category: "Portrait",
    description: "A character-focused frame with dramatic, natural light.",
    text: "Create a cinematic vertical 9:16 portrait of [subject] in [setting]. Frame from the chest up with the face clearly visible and positioned near the center. Use soft directional light, a rich but natural color palette, and a softly blurred background. Keep the composition uncluttered with no text, watermark, or logo.",
  },
  {
    id: "travel-destination",
    title: "Travel destination",
    category: "Cinematic",
    description: "A scenic establishing image for a travel story.",
    text: "Create a cinematic vertical 9:16 establishing image of [destination] at [time of day]. Place the most recognizable landmark in the middle of the frame, with a clear foreground and atmospheric depth. Use realistic travel photography, balanced contrast, and natural colors. No text, watermark, or logo.",
  },
  {
    id: "forest-morning",
    title: "Forest morning",
    category: "Nature",
    description: "A calm outdoor scene with layered depth and gentle light.",
    text: "Create a serene vertical 9:16 image of a [forest type] just after sunrise. Soft beams of light pass through the trees and illuminate a winding path leading into the scene. Add subtle morning mist, detailed foliage, and a peaceful cinematic mood. Keep the scene realistic and free of text, watermark, or logo.",
  },
  {
    id: "product-spotlight",
    title: "Product spotlight",
    category: "Product",
    description: "A polished hero image that keeps the item easy to read.",
    text: "Create a premium vertical 9:16 product photograph featuring [product] on a [surface] against a [background]. Keep the full product in sharp focus near the center, with soft studio lighting, realistic materials, and a subtle shadow. Leave clean negative space above and below. No extra objects, text, watermark, or logo.",
  },
  {
    id: "cozy-interior",
    title: "Cozy interior",
    category: "Interiors",
    description: "A warm room scene suited to a lifestyle or home reel.",
    text: "Create a warm vertical 9:16 interior photograph of a [room] with [key furniture or detail]. Soft natural light enters from one side, revealing tactile materials and a calm lived-in atmosphere. Use a balanced composition with a clear focal point and realistic proportions. No people, text, watermark, or logo.",
  },
  {
    id: "fantasy-world",
    title: "Fantasy world",
    category: "Fantasy",
    description: "An original imaginative scene with a strong focal subject.",
    text: "Create an original vertical 9:16 fantasy scene showing [character or creature] at [location]. Make the subject immediately recognizable against a richly layered environment, with atmospheric lighting and a cohesive color palette. Use detailed, polished illustration without referencing an existing franchise. No text, watermark, or logo.",
  },
  {
    id: "food-editorial",
    title: "Food editorial",
    category: "Food",
    description: "A close, appetizing frame with natural food styling.",
    text: "Create an editorial vertical 9:16 food photograph of [dish] on [tableware or surface]. Show appetizing texture and fresh ingredients in crisp detail, with soft side lighting and a gently blurred background. Keep the dish as the clear focal point and styling believable. No text, watermark, or logo.",
  },
  {
    id: "minimal-background",
    title: "Minimal background",
    category: "Abstract",
    description: "A clean visual backdrop with room for later overlays.",
    text: "Create a minimal vertical 9:16 abstract background using [colors] and [subtle texture]. Keep the center visually calm and uncluttered, with gentle tonal variation toward the edges. Use smooth gradients and restrained detail so foreground text or a subject can be added later. No objects, text, watermark, or logo.",
  },
];

export const PROMPT_CATEGORIES = [
  "All",
  ...new Set(PROMPT_TEMPLATES.map(({ category }) => category)),
];

export function filterPromptTemplates(query = "", category = "All") {
  const search = query.trim().toLocaleLowerCase();

  return PROMPT_TEMPLATES.filter((prompt) => {
    if (category !== "All" && prompt.category !== category) return false;
    if (!search) return true;
    return [
      prompt.title,
      prompt.category,
      prompt.description,
      prompt.text,
    ].some((value) => value.toLocaleLowerCase().includes(search));
  });
}
