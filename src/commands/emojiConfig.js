import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { isAdmin } from '../booster/utils/validators.js';
import { log } from '../booster/utils/logger.js';
import { getAllCategories, getEmojisByCategory } from '../utils/defaultEmojis.js';

export const data = new SlashCommandBuilder()
  .setName('emoji-config')
  .setDescription('Manage custom emojis for this server')
  .setDefaultMemberPermissions('0');

export async function execute(interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isAdmin(member)) {
    return interaction.reply({
      content: '❌ Only admins can manage emoji configuration.',
      ephemeral: true,
    });
  }

  const emojiManager = interaction.client.emojiManager;
  const dashboardConfig = await emojiManager.getConfigForDashboard(interaction.guildId);
  
  const categories = getAllCategories();
  const embed = buildMainPanel(dashboardConfig, categories);
  
  const categoryButtons = new ActionRowBuilder().addComponents(
    ...categories.map((cat, idx) =>
      new ButtonBuilder()
        .setCustomId(`emoji_category_${cat}`)
        .setLabel(cat.toUpperCase())
        .setStyle(ButtonStyle.Primary)
        .setDisabled(idx > 4) // Discord limit
    )
  );

  return interaction.reply({
    embeds: [embed],
    components: [categoryButtons],
    ephemeral: true,
  });
}

/**
 * Build main emoji panel with overview
 */
function buildMainPanel(dashboardConfig, categories) {
  const totalEmojis = Object.values(dashboardConfig).reduce((acc, cat) => {
    return acc + Object.keys(cat).length;
  }, 0);

  const customEmojis = Object.values(dashboardConfig).reduce((acc, cat) => {
    return acc + Object.values(cat).filter(e => e.isCustom).length;
  }, 0);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎨 Emoji Configuration')
    .setDescription(
      `Manage custom emojis for this server. Click a category to view and modify emojis.\n\n` +
      `**Total Emojis:** ${totalEmojis}\n` +
      `**Custom Overrides:** ${customEmojis}`
    )
    .addFields(
      ...Array.from({ length: Math.ceil(categories.length / 2) }, (_, idx) => {
        const cats = categories.slice(idx * 2, idx * 2 + 2);
        return {
          name: cats.map(c => `${c.toUpperCase()}`).join(' • '),
          value: cats.map(c => `\`${c}\``).join(' '),
          inline: false,
        };
      })
    )
    .setFooter({ text: 'Select a category to manage emojis' });

  return embed;
}

/**
 * Build category panel with emoji list
 */
export function buildCategoryPanel(category, categoryEmojis) {
  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle(`🎨 ${category.toUpperCase()} Emojis`)
    .setDescription('Click an emoji to modify it');

  for (const [key, emoji] of Object.entries(categoryEmojis)) {
    const status = emoji.isCustom ? '✨ CUSTOM' : '📌 DEFAULT';
    embed.addField(
      `${emoji.current || emoji.default} ${emoji.label}`,
      `\`${key}\` - ${status}`,
      true
    );
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`emoji_select_${category}`)
    .setPlaceholder('Select an emoji to modify...')
    .addOptions(
      Object.entries(categoryEmojis).map(([key, emoji]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(emoji.label)
          .setValue(key)
          .setEmoji(emoji.current || emoji.default)
          .setDescription(emoji.isCustom ? 'Custom emoji' : 'Using default')
      )
    );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('emoji_back')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embed,
    selectRow: new ActionRowBuilder().addComponents(selectMenu),
    buttonRow: buttons,
  };
}

/**
 * Build emoji details panel
 */
export function buildEmojiDetailsPanel(emojiKey, emojiData, serverEmojis) {
  const embed = new EmbedBuilder()
    .setColor(0xF47FFF)
    .setTitle(`Modify: ${emojiData.label}`)
    .setDescription(
      `**Current:** ${emojiData.current || emojiData.default}\n` +
      `**Default:** ${emojiData.default}\n` +
      `**Type:** ${emojiData.isCustom ? 'Custom Emoji' : 'Unicode Emoji'}`
    )
    .addField('Key', `\`${emojiKey}\``, true)
    .addField('Category', 'emoji', true);

  if (emojiData.current) {
    embed.addField('Custom Emoji ID', emojiData.current.id, false);
    embed.addField('Source Server', emojiData.current.server, false);
  }

  // Server selector dropdown
  const serverOptions = serverEmojis.map((server, idx) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(`${server.name} (${server.emojiCount})`)
      .setValue(`server_${server.id}`)
      .setDescription(`Select emojis from this server`)
  );

  const serverSelect = new StringSelectMenuBuilder()
    .setCustomId(`emoji_server_select_${emojiKey}`)
    .setPlaceholder('Choose a server for custom emojis...')
    .addOptions(serverOptions);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`emoji_reset_${emojiKey}`)
      .setLabel('Reset to Default')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('emoji_back_category')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embed,
    serverSelectRow: new ActionRowBuilder().addComponents(serverSelect),
    buttonRow: buttons,
  };
}

/**
 * Build emoji picker from server
 */
export function buildServerEmojiPicker(emojiKey, serverName, serverEmojis) {
  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle(`Select Emoji from ${serverName}`)
    .setDescription(
      `Choose a custom emoji to use for **${emojiKey}**\n\n` +
      `${serverEmojis.length} emojis available`
    );

  // Split into pages if too many emojis
  const pageSize = 25;
  const pages = Math.ceil(serverEmojis.length / pageSize);

  const options = serverEmojis.slice(0, pageSize).map(emoji =>
    new StringSelectMenuOptionBuilder()
      .setLabel(emoji.name.slice(0, 100))
      .setValue(`emoji_${emoji.id}`)
      .setEmoji(emoji.unicode)
  );

  const emojiSelect = new StringSelectMenuBuilder()
    .setCustomId(`emoji_select_from_server_${emojiKey}`)
    .setPlaceholder('Select custom emoji...')
    .addOptions(options);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('emoji_cancel_picker')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embed,
    emojiSelectRow: new ActionRowBuilder().addComponents(emojiSelect),
    buttonRow: buttons,
  };
}

log('info', 'EmojiConfig', 'Emoji configuration command loaded');
