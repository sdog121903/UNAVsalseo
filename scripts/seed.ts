import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// Load .env.local so we can run outside of Next.js
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Text-only posts ──────────────────────────────────────────────────
const textOnlyPosts = [
  "Just got out of the longest lecture ever... 3 hours of databases 😴",
  "Does anyone know if the library is open past 10 tonight? Need to finish this paper.",
  "Hot take: morning classes before 9am should be illegal.",
  "Finally submitted my thesis draft. I can see colors again 🎉",
  "Looking for a study group for the algorithms exam next week. Anyone interested? DM me!",
  "The wifi in Building C is absolutely terrible today. Anyone else having issues?",
  "Pro tip: the coffee from the machine on the 3rd floor is WAY better than the cafeteria one ☕",
  "Three exams in one week should literally be against university policy 📚",
  "Just found out the deadline got extended by a week. Best news I've heard all semester.",
  "If anyone finds a blue notebook in lecture hall 204, it's mine! Has all my notes in it 😭",
  "Who else is going to the open mic night on Friday? Heard it's going to be great this time.",
  "Can someone explain recursion to me like I'm five? Asking for myself.",
  "The sunset from the rooftop terrace today was absolutely unreal.",
  "Note to self: starting an assignment the night before it's due is NOT a viable strategy.",
  "Anyone want to grab lunch after the 12:30 class? Thinking about trying the new place on campus.",
  "Semester's almost over and I still don't know half the people in my project group lol",
  "Just aced my presentation! All that practice in front of my mirror paid off 💪",
  "Rain + no umbrella + 10 minute walk to class = worst morning ever",
  "The vending machine ate my money again. That's the third time this month.",
  "Friendly reminder to drink water and take breaks while studying. Your brain needs it 🧠",
  "I love how the campus looks in autumn. The trees are gorgeous right now 🍂",
  "Does anyone have the slides from today's marketing class? I was stuck in traffic.",
  "Why do group projects always end up with one person doing everything?",
  "Just discovered the quiet study room on the 4th floor. Game changer.",
  "To whoever left cookies in the common room: thank you, you're an angel 🍪",
];

// ── Posts with images (using picsum.photos with stable seeds) ─────────
const imagePosts = [
  {
    content: "Campus looking beautiful today 🌿",
    media_url: "https://picsum.photos/seed/campus1/800/600",
  },
  {
    content: "My study setup for finals week. Wish me luck!",
    media_url: "https://picsum.photos/seed/study1/800/600",
  },
  {
    content: "The architecture of the new building is incredible",
    media_url: "https://picsum.photos/seed/building1/800/1000",
  },
  {
    content: "Found this view between classes 📸",
    media_url: "https://picsum.photos/seed/view1/800/500",
  },
  {
    content: "Coffee and code — the perfect combo ☕💻",
    media_url: "https://picsum.photos/seed/coffee1/800/800",
  },
  {
    content: "Sunset from the library rooftop 🌅",
    media_url: "https://picsum.photos/seed/sunset1/800/500",
  },
  {
    content: "New semester, new planner. Let's do this 📓",
    media_url: "https://picsum.photos/seed/planner1/800/1000",
  },
  {
    content: "The courtyard after the rain is so peaceful",
    media_url: "https://picsum.photos/seed/rain1/800/600",
  },
  {
    content: "Art installation in the main hall — what do you think it means?",
    media_url: "https://picsum.photos/seed/art1/800/900",
  },
  {
    content: "Late night study grind 🌙",
    media_url: "https://picsum.photos/seed/night1/800/600",
  },
  {
    content: "Spring has arrived on campus!",
    media_url: "https://picsum.photos/seed/spring1/800/500",
  },
  {
    content: "This is what 4 hours of debugging looks like 😅",
    media_url: "https://picsum.photos/seed/debug1/800/800",
  },
  {
    content: "The food at the new café is actually really good",
    media_url: "https://picsum.photos/seed/food1/800/600",
  },
  {
    content: "Weekend vibes at the park next to campus 🌳",
    media_url: "https://picsum.photos/seed/park1/800/600",
  },
  {
    content: "Check out this cool mural I found in the hallway",
    media_url: "https://picsum.photos/seed/mural1/800/1100",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────

/** Returns a random date within the last `days` days */
function randomRecentDate(days: number): string {
  const now = Date.now();
  const offset = Math.random() * days * 24 * 60 * 60 * 1000;
  return new Date(now - offset).toISOString();
}

/** Returns a random integer between min and max (inclusive) */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Main ──────────────────────────────────────────────────────────────

const shouldClean = process.argv.includes("--clean");

async function seed() {
  console.log("🌱 Starting seed...\n");

  if (shouldClean) {
    console.log("🧹 Cleaning existing posts...");
    const { error: deleteError } = await supabase
      .from("posts")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // deletes all rows
    if (deleteError) {
      console.error("Error cleaning posts:", deleteError);
      process.exit(1);
    }
    console.log("✓ All existing posts deleted.\n");
  }

  // Build all rows
  const rows = [
    ...textOnlyPosts.map((content) => ({
      content,
      media_url: null,
      media_type: null,
      likes: randomInt(0, 42),
      created_at: randomRecentDate(14), // spread over last 2 weeks
    })),
    ...imagePosts.map(({ content, media_url }) => ({
      content,
      media_url,
      media_type: "image" as const,
      likes: randomInt(0, 42),
      created_at: randomRecentDate(14),
    })),
  ];

  // Shuffle so text and image posts are interleaved
  rows.sort(() => Math.random() - 0.5);

  console.log(`Inserting ${rows.length} demo posts...`);

  const { error } = await supabase.from("posts").insert(rows);

  if (error) {
    console.error("Error inserting posts:", error);
    process.exit(1);
  }

  console.log(`\n✅ Successfully inserted ${rows.length} posts (${textOnlyPosts.length} text-only, ${imagePosts.length} with images)`);
  console.log("Open your app to see the feed filled with content!");
}

seed();
