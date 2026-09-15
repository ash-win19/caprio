# Top navigation research for Caprio

Researched September 15, 2026. Sources are official product documentation and changelogs. This note records documented controls and their placement. It does not claim inspection of authenticated competitor screens, exact dimensions, sticky behavior, colors, or all responsive breakpoints.

The useful shared pattern is a sidebar for destinations and a content header for the current view and its controls. A global topbar can establish a consistent place for page context, but the products studied do not support duplicating every sidebar destination in a horizontal menu. That conclusion is a design inference from the evidence below.

## Linear

- Favorites are personal shortcuts in the sidebar. A star beside the current view name in the topbar adds or removes a favorite. This connects an action on the current view to persistent navigation. [Favorites](https://linear.app/docs/favorites)
- Supported views place Display options at the top-right. Available controls vary with the view and cover layout, grouping, ordering, and visible properties. Linear explicitly says a view without Display options does not support that control. [Display options](https://linear.app/docs/display-options)
- Workspace search opens from the magnifying glass beside New Issue in the sidebar or the `/` shortcut. Search inside the current view uses `Cmd/Ctrl+F` and appears at the top-right beside Display options. Global search and view filtering have separate scope and entry points. [Search](https://linear.app/docs/search)
- The command menu supports actions on selected issues through `Cmd/Ctrl+K`. It supplements visible contextual menus. [Select issues](https://linear.app/docs/select-issues)
- The mobile redesign introduced bottom navigation for core workflows and a Create Issue action at the top of each screen. The January 2026 update lets users rearrange the bottom navigation and pin specific content. [Mobile redesign](https://linear.app/changelog/2025-10-16-mobile-app-redesign), [Customize mobile navigation](https://linear.app/changelog/2026-01-22-customize-your-navigation-in-linear-mobile)

Reusable pattern: keep page identity stable, put view-specific controls beside the content, and give command actions a keyboard path. Avoid copying project-management controls such as grouping, team switching, or favorites unless Caprio has a real corresponding need.

## Todoist

- The desktop sidebar holds Inbox, Today, filters, labels, favorites, personal projects, and team projects. A top-left sidebar toggle changes its visibility. Hidden destinations remain accessible through `Cmd/Ctrl+K`. [Customize the sidebar](https://www.todoist.com/help/todoist/features/customize-the-sidebar-and-navigation-menu-in-todoist-S9JLTYqZV)
- In Upcoming, previous/next week arrows and a Today button are at the top-right. On mobile, users swipe the week picker, select a day, and use the current-month selector to jump to another date. Desktop Display controls also live at the top-right. These are controls for a calendar-related page, not evidence that every Todoist page gets date navigation. [Upcoming view](https://www.todoist.com/help/todoist/get-started/plan-your-week-with-the-upcoming-view-OKOg1mR8)
- On iOS and Android, users can select and rearrange bottom navigation tabs. Available destinations include Inbox, Today, Upcoming, Search, and Browse. A destination placed in the tab bar is removed from Browse, reducing duplicated navigation. [Customize the navigation bar](https://www.todoist.com/help/todoist/features/customize-the-todoist-navigation-bar-L4qpkI0xj)

Reusable pattern: pair date traversal with an obvious way back to today. Put calendar controls on pages whose content actually changes with the date. Avoid carrying a desktop-width control row into mobile or repeating the same destination in multiple navigation regions without a reason.

## Notion

- The sidebar organizes destinations and nested content, exposes search, and includes the workspace switcher. Search also opens with `Cmd/Ctrl+K`. The sidebar can collapse and resize. [Navigate with the sidebar](https://www.notion.com/help/navigate-with-the-sidebar)
- Breadcrumbs at the top identify the current page and where it sits within the page hierarchy. [Create a subpage](https://www.notion.com/help/create-a-subpage)
- Share is at the top-right of the current page. Collaborator avatars and a page overflow menu also occupy the top of the page. Their function is specific to the open document. [Share your work](https://www.notion.com/help/share-your-work), [Sharing and permissions](https://www.notion.com/help/sharing-and-permissions)
- Mobile uses a persistent bottom bar for workspace navigation, search, inbox, and creating a page. [Workspaces on mobile](https://www.notion.com/help/workspaces-on-mobile)

Reusable pattern: the topbar helps users identify where they are and act on the open content. Breadcrumbs are useful where a real parent-child hierarchy exists. Avoid inventing a breadcrumb hierarchy for flat Caprio pages or adding collaboration avatars and Share controls to a personal planner without supported collaboration.

## Sunsama

- The left panel holds workspace views, daily and weekly rituals, settings, and access to focus mode. It can collapse. [Workspace navigation](https://help.sunsama.com/docs/usage-guides/workspace-navigation/)
- In any workspace view, the date picker sits at the top-left of the center panel. It opens a monthly calendar and supports day/week navigation. A separate return action restores today. Filters above the board scope the visible tasks by channel or context. [Workspace navigation](https://help.sunsama.com/docs/usage-guides/workspace-navigation/)
- Today view uses the same date navigation, can display other days, and hides the left navigation panel by default. Its documented purpose is a focused task list once daily planning is complete. [Today view](https://help.sunsama.com/docs/usage-guides/today-view/)

Reusable pattern: keep the selected date visible and navigable across the daily workflow, with a consistent way back to today. This is the closest match to Caprio's planning, execution, and review pages. Avoid assuming Sunsama's multi-panel board or channel filters are required for Caprio. This research did not verify Sunsama mobile placement.

## Implications for the Caprio proposal

These are design judgments, not competitor facts:

- Treat the topbar as the persistent frame for current-page identity and a small number of useful actions. Preserve the sidebar as the primary desktop destination map.
- Date context deserves special attention because Caprio can open a historical review at login. The selected date and an explicit Today action should make that state understandable. Their routing must work with the app's recovery policy; an action that immediately redirects back to the old review would not solve the problem.
- A stable topbar does not require identical controls on every page. Date navigation belongs on date-scoped pages; settings and the undated backlog should show their own context.
- Search or a command launcher can support navigation and common actions once its real behavior is specified. Competitor examples do not justify a decorative search field with no search implementation.
- Reuse the mobile principle of fewer visible controls and separately accessible destinations. Whether Caprio uses a bottom bar or a menu drawer needs a separate layout decision, not an untested assumption from desktop.
- Do not add a notification bell, workspace switcher, collaboration avatars, or a second row of page links merely to fill space. Those controls need product behavior before they earn a permanent position.
