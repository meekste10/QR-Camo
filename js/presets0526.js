const BASE = "./assets/masks/";

export const presetShapeCategories = [
  {
    category: "Business",
    shapes: [
      { key: "calendar", label: "Calendar", src: `${BASE}Calendar.PNG` },
      { key: "camera", label: "Camera", src: `${BASE}Camera.PNG` },
      { key: "cloud", label: "Cloud", src: `${BASE}Cloud.PNG` },
      { key: "file", label: "File", src: `${BASE}File.PNG` },
      { key: "info", label: "Info", src: `${BASE}Info.PNG` },
      { key: "location", label: "Location", src: `${BASE}Location.PNG` },
      { key: "megaphone", label: "Megaphone", src: `${BASE}Megaphone.PNG` },
      { key: "phone", label: "Phone", src: `${BASE}Phone.PNG` },
      { key: "profile", label: "Profile", src: `${BASE}Profile.PNG` },
      { key: "ticket", label: "Ticket", src: `${BASE}Ticket.PNG` },
      { key: "trophy", label: "Trophy", src: `${BASE}Trophy.PNG` }
    ]
  },
  {
    category: "Celebration & Events",
    shapes: [
      { key: "balloon", label: "Balloon", src: `${BASE}Balloon.PNG` },
      { key: "candle", label: "Candle", src: `${BASE}Candle.PNG` },
      { key: "gift", label: "Gift", src: `${BASE}Gift.PNG` },
      { key: "heart", label: "Heart", src: `${BASE}Heart.PNG` },
      { key: "star", label: "Star", src: `${BASE}star.png` }
    ]
  },
  {
    category: "Commerce & Payments",
    shapes: [
      { key: "credit-card-hand", label: "Card Hand", src: `${BASE}Credit-card-hand.PNG` },
      { key: "dollar-sign", label: "Dollar Sign", src: `${BASE}Dollar-sign.PNG` },
      { key: "shop", label: "Shop", src: `${BASE}Shop.PNG` },
      { key: "shop-2", label: "Shop 2", src: `${BASE}Shop-2.PNG` },
      { key: "tip-jar", label: "Tip Jar", src: `${BASE}Tip-jar.PNG` },
      { key: "wallet", label: "Wallet", src: `${BASE}Wallet.PNG` }
    ]
  },
  {
    category: "Food & Drink",
    shapes: [
      { key: "fish", label: "Fish", src: `${BASE}Fish.PNG` },
      { key: "food-platter", label: "Food Platter", src: `${BASE}Food-platter.PNG` },
      { key: "lobster", label: "Lobster", src: `${BASE}Lobster.PNG` },
      { key: "martini-glass", label: "Martini Glass", src: `${BASE}Martini-glass.PNG` },
      { key: "mug", label: "Mug", src: `${BASE}mug.PNG` },
      { key: "pizza-slice", label: "Pizza Slice", src: `${BASE}Pizza-slice.PNG` },
      { key: "wine-glass", label: "Wine Glass", src: `${BASE}Wine-glass.PNG` }
    ]
  },
  {
    category: "Home & Real Estate",
    shapes: [
      { key: "door", label: "Door", src: `${BASE}Door.PNG` },
      { key: "hammer", label: "Hammer", src: `${BASE}Hammer.PNG` },
      { key: "house", label: "House", src: `${BASE}house.png` },
      { key: "house-2", label: "House 2", src: `${BASE}House-2.PNG` },
      { key: "house-fence", label: "House Fence", src: `${BASE}House-fence.PNG` },
      { key: "key", label: "Key", src: `${BASE}Key.PNG` },
      { key: "keyhole", label: "Keyhole", src: `${BASE}Keyhole.PNG` },
      { key: "lock", label: "Lock", src: `${BASE}Lock.PNG` },
      { key: "toolkit", label: "Toolkit", src: `${BASE}Toolkit.PNG` },
      { key: "tree", label: "Tree", src: `${BASE}tree.png` }
    ]
  },
  {
    category: "Other",
    shapes: [
      { key: "human-head", label: "Human Head", src: `${BASE}Human-head.PNG` },
      { key: "microphone", label: "Microphone", src: `${BASE}Microphone.PNG` },
      { key: "pharmacy", label: "Pharmacy", src: `${BASE}Pharmacy.PNG` },
      { key: "play-button", label: "Play Button", src: `${BASE}Play-button.PNG` },
      { key: "repair-wrench", label: "Repair Wrench", src: `${BASE}Repair-Wrench.PNG` },
      { key: "turtle", label: "Turtle", src: `${BASE}turtle.png` }
    ]
  }
];

export const maskPresets = Object.fromEntries(
  presetShapeCategories.flatMap((group) =>
    group.shapes.map((shape) => [shape.key, shape.src])
  )
);
