// OakwoodAdditional.js
const PATHS = {
  old: "modules/k4lt-assets/scenarios/oakwood-heights/portraits",
  new: "modules/k4lt-assets-ai/scenarios/oakwood-heights/portraits/",
};
const JOURNAL_UUID =
  "Compendium.k4lt-assets-ai.additional-journals--oh.JournalEntry.1bJykpcr0GQPwEu4";
const JOURNAL_ID = JOURNAL_UUID.split(".").pop();
const TOKEN_IMAGES = {
  /*
  "Scene.xxx.Token.yyy":
    "modules/k4lt-assets-ai/scenarios/oakwood-heights/portraits/example.webp",
  */
};
export async function checkForOakwoodHeightsModule() {
  const isModuleEnabled = game.modules.get("k4lt-assets")?.active;
  if (!isModuleEnabled) {
    kultLogger("Module 'k4lt-assets' is not active. Skipping assets module check.");
    return;
  }
  if (!game.user.isGM) return;
  const essentialActors = ["Aidan Kostroff", "Caitlyn Dehamre", "Felicia Jenner", "Joshua Katz"];
  const foundEssential = essentialActors.some(name => game.actors.getName(name));
  if (!foundEssential) {
    kultLogger("📦 No essential scenario actors found. Application of content delayed.");
    await game.settings.set("k4lt-assets-ai", "useOakwoodAdditionalContent", false);
    return;
  }
  const hideDialog = game.settings.get("k4lt-assets-ai", "hideAssetsDialog");
  if (hideDialog) {
    kultLogger("The dialog box is disabled via the settings.");
    const useContent = game.settings.get("k4lt-assets-ai", "useOakwoodAdditionalContent");
    return useContent ? applyOakwoodAdditionalContent() : removeOakwoodAdditionalContent();
  }
  const confirmed = await new Promise(resolve => {
    const content = `
      <p>${game.i18n.localize("k4lt-assets-ai.Oakwood.Dialog.moduleActivatedContent")}</p>
      <p>${game.i18n.localize("k4lt-assets-ai.Dialog.moduleActivatedQuestion")}</p>
      <div style="display:flex;justify-content:center;margin-top:10px;">
        <label style="display:flex;align-items:center;">
          <input id="dontShowAgain" type="checkbox" style="margin-right:5px;" />
          ${game.i18n.localize("k4lt-assets-ai.Dialog.doNotShowAgain")}
        </label>
      </div>
    `;
    new Dialog({
      title: game.i18n.localize("k4lt-assets-ai.Dialog.moduleActivatedTitle"),
      content,
      buttons: {
        yes: {
          label: game.i18n.localize("Yes"),
          callback: html => {
            if (html.find("#dontShowAgain").is(":checked")) game.settings.set("k4lt-assets-ai", "hideAssetsDialog", true);
            resolve(true);
          },
        },
        no: {
          label: game.i18n.localize("No"),
          callback: html => {
            if (html.find("#dontShowAgain").is(":checked")) game.settings.set("k4lt-assets-ai", "hideAssetsDialog", true);
            resolve(false);
          },
        },
      },
      default: "no",
    }).render(true);
  });
  await game.settings.set("k4lt-assets-ai", "useOakwoodAdditionalContent", confirmed);
  return confirmed ? applyOakwoodAdditionalContent() : removeOakwoodAdditionalContent();
}
function formatFilenameFromName(name) {
  const hasG = /\(g\)$/i.test(name);
  return name
    .replace(/\(g\)$/i, "")
    .toLowerCase()
    .replace(/['"‘’]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\./g, "")
    .trim()
    .replace(/\s+/g, "-") + (hasG ? "-g" : "");
}
async function getUpdatedImage(actor, currentImg, fromPath, toPath) {
  let targetImg = null;
  if (currentImg?.startsWith(fromPath)) {
    targetImg = toPath + currentImg.split("/").pop();
  } else if (currentImg?.includes("icons/svg/mystery-man.svg")) {
    targetImg = `${toPath}${formatFilenameFromName(actor.name)}.webp`;
  }
  if (!targetImg) return null;
  try {
    const files = await foundry.applications.apps.FilePicker.implementation.browse("data", toPath);
    return files.files.includes(targetImg) ? targetImg : null;
  } catch {
    return null;
  }
}
async function updateActorTokens(actor, img) {
  for (const scene of game.scenes) {
    const updates = [];
    for (const token of scene.tokens) {
      if (!token.actorLink || token.actorId !== actor.id) continue;
      updates.push({ _id: token.id, "texture.src": img });
    }
    if (updates.length) await scene.updateEmbeddedDocuments("Token", updates);
  }
}
async function updateStandaloneTokens(apply) {
  for (const [uuid, img] of Object.entries(TOKEN_IMAGES)) {
    const token = await fromUuid(uuid);
    if (!token) continue;
    if (apply) {
      const original = token.getFlag("k4lt-assets-ai", "originalTexture");
      if (!original) await token.setFlag("k4lt-assets-ai", "originalTexture", token.texture.src);
      await token.update({ "texture.src": img });
    } else {
      const original = token.getFlag("k4lt-assets-ai", "originalTexture");
      if (!original) continue;
      await token.update({ "texture.src": original });
      await token.unsetFlag("k4lt-assets-ai", "originalTexture");
    }
  }
}
async function importAdditionalJournal() {
  const existing = game.journal.get(JOURNAL_ID);
  if (existing) return;
  const journal = await fromUuid(JOURNAL_UUID);
  if (!journal) return kultLogger("❌ Unable to find additional journal.");
  const pack = game.packs.get("k4lt-assets-ai.additional-journals--oh");
  if (!pack) return kultLogger("❌ Additional journal pack not found.");
  const imported = await game.journal.importFromCompendium(pack, journal.id);
  kultLogger(`📖 Imported journal "${imported.name}".`);
}
async function removeAdditionalJournal() {
  const journal = game.journal.get(JOURNAL_ID);
  if (!journal) return;
  await journal.delete();
  kultLogger(`📖 Removed journal "${journal.name}".`);
}
async function applyOakwoodAdditionalContent() {
  kultLogger("✅ Applying Oakwood Heights additional content.");
  await importAdditionalJournal();
  await updateStandaloneTokens(true);
  for (const actor of game.actors) {
    const currentImg = actor.img;
    const newImg = await getUpdatedImage(actor, currentImg, PATHS.old, PATHS.new);
    if (!newImg || newImg === currentImg) continue;
    const originalData = actor.getFlag("k4lt-assets-ai", "originalPortraitData");
    if (!originalData) {
      await actor.setFlag("k4lt-assets-ai", "originalPortraitData", {
        img: actor.img,
        prototype: actor.prototypeToken.texture.src,
      });
    }
    kultLogger(`🖼️ Updating portrait for ${actor.name} -> ${newImg}`);
    await actor.update({ img: newImg, "prototypeToken.texture.src": newImg });
    await updateActorTokens(actor, newImg);
  }
}
async function removeOakwoodAdditionalContent() {
  kultLogger("❌ Removing Oakwood Heights additional content.");
  await removeAdditionalJournal();
  await updateStandaloneTokens(false);
  for (const actor of game.actors) {
    const originalData = actor.getFlag("k4lt-assets-ai", "originalPortraitData");
    if (!originalData) continue;
    await actor.update({ img: originalData.img, "prototypeToken.texture.src": originalData.prototype });
    await updateActorTokens(actor, originalData.prototype);
    await actor.unsetFlag("k4lt-assets-ai", "originalPortraitData");
  }
}