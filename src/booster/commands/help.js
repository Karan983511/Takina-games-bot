import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const PAGES = {
  main: () => new EmbedBuilder().setColor(0xF47FFF)
    .setTitle('🌸 Takina Booster Bot — Help Menu')
    .setDescription('Use the buttons below to browse help sections, or type `.help <section>`.')
    .addFields(
      { name: '🎨 Role Setup',    value: '`.help rolesetup` — Set up your custom role',               inline: true },
      { name: '🎮 Booster',       value: '`.help booster` — Dashboard, VCs, sharing, backups',        inline: true },
      { name: '⚙️ Settings',      value: '`.help settings` — Admin panel, boundaries, toggles',       inline: true },
    )
    .setFooter({ text: 'Prefix: .  |  Only boosters can use booster commands.' }),

  rolesetup: () => new EmbedBuilder().setColor(0xF47FFF).setTitle('🎨 Role Commands')
    .setDescription(
      'Run `.role setup` to open the persistent role editor.\n\n' +
      'The embed stays live — click any option, send your input, and the embed updates instantly. ' +
      'Nothing is applied to Discord until you press **Save**.'
    )
    .addFields(
      { name: '`.role setup`',          value: 'Open (or reopen) your role editor. Loads existing values if you already have a role.' },
      { name: '1️⃣ Name',                value: 'Click → send a message → role name is updated in the embed.' },
      { name: '2️⃣ Colors',              value: 'Click → send one hex (`#FF6793`) **or** two hexes (`#FF6793 #FF8E3A`) for a gradient. Both colors are stored.' },
      { name: '3️⃣ Icon',                value: 'Click → send a unicode emoji, a custom Discord emoji `<:name:id>`, or upload a PNG/JPG/WEBP image (max 256 KB).' },
      { name: '4️⃣ Preview',             value: 'Shows your current name, colors, and icon before saving.' },
      { name: '5️⃣ Save',                value: 'Creates or updates your Discord role with all the settings above.' },
      { name: '📏 Role Boundaries',      value: 'Your role is always placed inside the admin-configured boundary — above game and auto-assign roles so your icon shows in chat.' },
      { name: '`.role give @user`',     value: 'Give your custom role to another member. They can wear it too.' },
      { name: '`.role remove @user`',   value: 'Take your custom role away from a member you previously gave it to.' },
      { name: '`.role removeme`',       value: 'Remove yourself from a custom role that was shared with you.' },
    ),

  booster: () => new EmbedBuilder().setColor(0xF47FFF).setTitle('🎮 Booster Commands')
    .addFields(
      { name: '`.booster`',                       value: 'Open your personal dashboard' },
      { name: '`.booster request-vc`',            value: 'Request a custom voice channel' },
      { name: '`.booster share add @user`',       value: 'Let another member wear your role' },
      { name: '`.booster share remove @user`',    value: 'Remove a member from your role' },
      { name: '`.booster share list`',            value: 'Show who has access to your role' },
      { name: '`.booster template list`',         value: 'Browse available color templates' },
      { name: '`.booster template apply <name>`', value: 'Apply a template color to your role' },
      { name: '`.booster backup`',                value: 'Save a backup of your role and VC' },
      { name: '`.booster restore`',               value: 'Restore your role and VC from backup' },
      { name: '`.booster export`',                value: 'Download your backup as a JSON file' },
      { name: '`.booster role delete`',           value: 'Soft-delete your custom role (data kept for restore)' },
      { name: '`.booster vc delete`',             value: 'Delete your custom voice channel' },
    ),

  settings: () => new EmbedBuilder().setColor(0x5865F2).setTitle('⚙️ Settings Commands')
    .setDescription('Admin only — requires Manage Guild permission.')
    .addFields(
      { name: '`.settings panel`',                         value: 'Open the full settings dashboard with feature toggles' },
      { name: '`.settings toggle <feature>`',              value: 'Enable or disable a feature (see panel for feature names)' },
      { name: '`.settings boundaries`',                    value: 'View current upper/lower role boundaries' },
      { name: '`.settings boundaries set @upper @lower`',  value: 'Set the two boundary roles — bot only touches roles between them' },
      { name: '`.settings templates list`',                value: 'List all color templates' },
      { name: '`.settings templates add <name> <#color>`', value: 'Add a custom template' },
      { name: '`.settings templates remove <name>`',       value: 'Remove a custom template' },
      { name: '`.settings history`',                       value: 'View the audit log (last 10 actions)' },
      { name: '`.settings log #channel`',                  value: 'Set a channel for bot action logs' },
    ),
};

function pageButtons(current) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('booster_help_main').setLabel('Home').setStyle(current === 'main' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('booster_help_rolesetup').setLabel('Role Setup').setStyle(current === 'rolesetup' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('booster_help_booster').setLabel('Booster').setStyle(current === 'booster' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('booster_help_settings').setLabel('Settings').setStyle(current === 'settings' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
}

export async function execute(message, args) {
  const section = (args[0] ?? 'main').toLowerCase();
  const page    = PAGES[section] ?? PAGES.main;
  return message.channel.send({ embeds: [page()], components: [pageButtons(section)] });
}

export function getPage(section) {
  return { embed: (PAGES[section] ?? PAGES.main)(), row: pageButtons(section) };
}
