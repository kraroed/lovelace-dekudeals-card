# DekuDeals Card for Home Assistant

A responsive Lovelace custom card for the [DekuDeals Home Assistant integration](https://github.com/kraroed/ha-dekudeals). Browse your imported game collection with cover art and descriptions, and keep an eye on physical copies, active loans, overdue returns, and inventory review items.

## Features

- Cover-art collection grid using the integration's `image` and `description` item attributes.
- Search by game title and filter by Switch / Switch 2 and physical / digital format.
- Physical inventory view with copy status and active borrower.
- Lend and return actions using the integration's `dekudeals.lend_game` and `dekudeals.return_game` services.
- Loan overview and collection reconciliation review actions.
- Responsive layout and Home Assistant theme variables.
- No external API calls, account credentials, or separate metadata fetching. All data comes from the integration's sensor attributes.

## Requirements

- Home Assistant with the [DekuDeals integration](https://github.com/kraroed/ha-dekudeals) installed and configured.
- A collection sensor exposing the `items` attribute.
- The **Total Physical Copies** sensor exposing the `copies` attribute.
- For lending and return actions, the integration's services must be loaded.

The integration currently exposes five collection sensors and eight inventory sensors. Home Assistant generates entity IDs based on your instance's naming and existing entities, so use the actual IDs shown under **Developer Tools → States**.

## Installation

### HACS (custom repository)

1. Open **HACS → Frontend**.
2. Open the three-dot menu and choose **Custom repositories**.
3. Add `https://github.com/kraroed/lovelace-dekudeals-card` and select **Dashboard** (frontend plugin) as the category.
4. Install **DekuDeals Card**.
5. If HACS does not automatically add the resource, add it under **Settings → Dashboards → Resources**:
   - URL: `/hacsfiles/lovelace-dekudeals-card/dekudeals-card.js`
   - Resource type: **JavaScript Module**
6. Refresh the browser after installation.

### Manual

Copy `dekudeals-card.js` into your Home Assistant `www` directory and add it as a JavaScript Module dashboard resource.

## Configuration

Add a **Manual card** to a dashboard and use the following YAML. Replace the example entity IDs with the IDs from your own Home Assistant instance.

```yaml
type: custom:dekudeals-card
title: My Game Collection
collection_entity: sensor.dekudeals_games
inventory_entity: sensor.dekudeals_total_physical_copies
lent_out_entity: sensor.dekudeals_games_lent_out
overdue_entity: sensor.dekudeals_games_overdue
needs_review_entity: sensor.dekudeals_inventory_needs_review
unmatched_entity: sensor.dekudeals_unmatched_physical_games
columns: 4
show_descriptions: true
show_inventory: true
```

The collection entity must expose an `items` array. The inventory entity must expose a `copies` array. The example entity IDs are illustrative only; HA may generate different IDs.

### Options

| Option | Required | Default | Description |
|---|---:|---|---|
| `collection_entity` | Yes | — | Collection sensor with the `items` attribute |
| `inventory_entity` | Yes | — | Total Physical Copies sensor with the `copies` attribute |
| `lent_out_entity` | No | — | Games Lent Out sensor, used for the summary count |
| `overdue_entity` | No | — | Games Overdue sensor |
| `needs_review_entity` | No | — | Inventory Needs Review sensor |
| `unmatched_entity` | No | — | Unmatched Physical Games sensor |
| `title` | No | DekuDeals Collection | Card heading |
| `columns` | No | 4 | Collection grid columns (2–8) |
| `show_descriptions` | No | true | Show game descriptions under cover art |
| `show_inventory` | No | true | Show inventory, loans, and review tabs |

## Using the card

- **Collection:** search by title and filter platform and format.
- **My copies:** view registered physical copies. Select a copy, enter a borrower and optional due date, then choose **Lend selected copy**.
- **Loans:** return an active loan with its **Return** button.
- **Review:** resolve reconciliation flags as **Present**, **Not present**, or **Manual**.

Borrower names and lending information are private local inventory data managed by the integration. The card displays them from the inventory sensor and submits service calls to Home Assistant; it does not send them to DekuDeals.

## Troubleshooting

- **Waiting for sensors:** confirm both required entity IDs exist and have the expected attributes in Developer Tools → States.
- **No cover art:** the integration only exposes artwork when supplied by the export or successfully retrieved from an eligible public DekuDeals item page.
- **Buttons do nothing:** confirm the DekuDeals integration is loaded and the relevant service exists under Developer Tools → Actions.
- **Wrong entity IDs:** entity IDs are assigned by Home Assistant and may differ from the examples above.

## Development

The card is a dependency-free JavaScript module. Run `node --check dekudeals-card.js` to check syntax. GitHub Actions runs this check and HACS plugin validation on pushes and pull requests.

## License

MIT. See [LICENSE](LICENSE).
