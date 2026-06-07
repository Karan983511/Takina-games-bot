import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const PAGES = {
  main: () => new EmbedBuilder().setColor(0xF47FFF)
    .setTitle('🌸 Takina Booster Bot — Help Menu')
    .setDescription('Use the buttons below to browse help sections, or type `.help <section>`.')
    .addFields(
      { name: '🎨 Booster Commands', value: '`.help booster` — Custom roles, VCs, templates, backups', inline: true },
      { name: '⚙️ Admin Panel',      value: '`.help admin` — `/bsetup` slash command guide',           inline: true },
      { name: '🗳️ Voting',           value: '`.help vote` — Featured role voting system',              inline: true },
      { name: '🏆 Hall of Fame',     value: '`.help hof` — Leaderboard & featured history',           inline: true },
    )
    .setFooter({ text: 'Prefix: .  |  Only boosters can use booster commands. Admins use /bsetup.' }),

  booster: () => new EmbedBuilder().setColor(0xF47FFF).setTitle('🎨 Booster Commands')
    .setDescription('Run `.role setup` to open the role creation wizard.')
    .addFields(
      { name: '`.booster`',                       value: 'Open your personal dashboard' },
      { name: '`.role setup`',                    value: 'Create or edit your custom role (wizard)' },
      { name: '`.booster edit name <name>`',      value: 'Rename your custom role' },
      { name: '`.booster edit color <#hex>`',     value: 'Change your role color (e.g. `#FF6B35`)' },
      { name: '`.booster share add @user`',       value: 'Let another member wear your role' },
      { name: '`.booster share remove @user`',    value: 'Remove a member from your role' },
      { name: '`.booster share list`',            value: 'Show who has access to your role' },
      { name: '`.booster template list`',         value: 'Browse available color templates' },
      { name: '`.booster template apply <name>`', value: 'Apply a template to your role' },
      { name: '`.booster backup`',                value: 'Save a backup of your role and VC' },
      { name: '`.booster restore`',               value: 'Restore your role and VC from backup' },
      { name: '`.booster vote`',                  value: 'Vote for a booster role to be featured' },
      { name: '`.booster vote status`',           value: 'See the current vote standings' },
      { name: '`.booster hof`',                   value: 'View the Hall of Fame' },
      { name: '`.booster role delete`',           value: 'Soft-delete your custom role (data kept)' },
      { name: '`.booster vc delete`',             value: 'Delete your custom VC' },
    ),

  admin: () => new EmbedBuilder().setColor(0x5865F2).setTitle('⚙️ Admin Panel — `/bsetup`')
    .setDescription(
      'Admins with **Manage Server** permission can configure the booster system using the `/bsetup` slash command.\n\n' +
      'The panel has the following sections:'
    )
    .addFields(
      { name: '📊 Overview',       value: 'Summary of active roles, features, and current config' },
      { name: '🎛️ Features',       value: 'Toggle individual features on/off (custom roles, VC, voting, etc.)' },
      { name: '🔒 Required Role',  value: 'Set a role members MUST have to keep their booster role. If removed, their role is soft-deleted automatically.' },
      { name: '📏 Boundaries',     value: 'Set upper/lower Discord role boundaries — booster roles are placed between them' },
      { name: '🔄 Rotation',       value: 'Configure automatic role rotation (featured rotation + boundary re-positioning)' },
      { name: '📝 Logging',        value: 'Set a channel to receive audit log messages for all booster actions' },
      { name: '🗑️ Retention',      value: 'How long soft-deleted role data is kept before permanent removal' },
      { name: '⚙️ System',         value: 'Purge data, reset settings, or view diagnostic info' },
    )
    .setFooter({ text: 'Old prefix commands: .settings panel | .settings boundaries | .settings toggle <feature>' }),

  vote: () => new EmbedBuilder().setColor(0xFEE75C).setTitle('🗳️ Voting System')
    .setDescription('Members vote for which booster role gets featured each week.')
    .addFields(
      { name: 'How it works', value: '1. Admin starts a session via `/bsetup` → Rotation\n2. Members vote for their favourite role\n3. Most-voted role becomes featured' },
      { name: '`.booster vote`',        value: 'Cast or change your vote' },
      { name: '`.booster vote status`', value: 'See current standings' },
      { name: '`.settings vote start`', value: 'Admin: start a new vote session' },
      { name: '`.settings vote end`',   value: 'Admin: end the session early' },
    ),

  hof: () => new EmbedBuilder().setColor(0xFFD700).setTitle('🏆 Hall of Fame')
    .setDescription('A permanent record of every featured booster role.')
    .addFields(
      { name: '`.booster hof`', value: 'View the featured role leaderboard' },
      { name: 'Tracks',         value: '• Featured roles\n• Total votes\n• Auto-rotation vs vote wins' },
    ),
};

function pageButtons(current) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('booster_help_main').setLabel('Home').setStyle(current === 'main' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('booster_help_booster').setLabel('Booster').setStyle(current === 'booster' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('booster_help_admin').setLabel('Admin /bsetup').setStyle(current === 'admin' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('booster_help_vote').setLabel('Voting').setStyle(current === 'vote' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('booster_help_hof').setLabel('Hall of Fame').setStyle(current === 'hof' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
}

export async function execute(message, args) {
  const section = (args[0] ?? 'main').toLowerCase();
  // allow "settings" as alias for "admin"
  const page = PAGES[section] ?? PAGES[section === 'settings' ? 'admin' : 'main'] ?? PAGES.main;
  return message.channel.send({ embeds: [page()], components: [pageButtons(section === 'settings' ? 'admin' : section)] });
}

export function getPage(section) {
  const key = section === 'settings' ? 'admin' : section;
  return { embed: (PAGES[key] ?? PAGES.main)(), row: pageButtons(key) };
}
