<script lang="ts">
	import { onMount } from 'svelte';
	import { musicKitStore } from '$lib/stores/musickit';

	let devToken = $state('');
	let replayData = $state<any>(null);
	let recentTracks = $state<any>(null);
	let error = $state('');
	let loading = $state(false);

	onMount(() => {
		// Check if MusicKit is already loaded
		if ((window as any).MusicKit) {
			musicKitStore.update(state => ({
				...state,
				isLoaded: true
			}));
		} else {
			// Wait for MusicKit to load
			document.addEventListener('musickitloaded', () => {
				musicKitStore.update(state => ({
					...state,
					isLoaded: true
				}));
			});
		}
	});

	function configureMusicKit() {
		if (!devToken.trim()) {
			error = 'Please enter a developer token';
			return;
		}

		try {
			const musicKit = (window as any).MusicKit;
			musicKit.configure({
				developerToken: devToken,
				app: {
					name: 'Replay Viewer',
					build: '1.0'
				}
			});

			const instance = musicKit.getInstance();

			musicKitStore.update(state => ({
				...state,
				isConfigured: true,
				developerToken: devToken,
				instance
			}));

			error = '';
		} catch (e) {
			error = `Configuration failed: ${e}`;
		}
	}

	async function authorize() {
		loading = true;
		error = '';

		try {
			const instance = $musicKitStore.instance;
			await instance.authorize();

			musicKitStore.update(state => ({
				...state,
				isAuthorized: true,
				musicUserToken: instance.musicUserToken
			}));
		} catch (e) {
			error = `Authorization failed: ${e}`;
		} finally {
			loading = false;
		}
	}

	async function getReplayData() {
		loading = true;
		error = '';
		replayData = null;
		recentTracks = null;

		try {
			const { developerToken, musicUserToken } = $musicKitStore;
			const headers = {
				'Authorization': `Bearer ${developerToken}`,
				'Music-User-Token': musicUserToken
			};

			// Fetch replay data
			const replayResponse = await fetch('https://api.music.apple.com/v1/me/replay', {
				headers
			});

			if (!replayResponse.ok) {
				throw new Error(`Replay API failed: ${replayResponse.status} ${replayResponse.statusText}`);
			}

			replayData = await replayResponse.json();

			// Fetch recent tracks
			const recentResponse = await fetch('https://api.music.apple.com/v1/me/recent/played/tracks?limit=100', {
				headers
			});

			if (!recentResponse.ok) {
				throw new Error(`Recent tracks API failed: ${recentResponse.status} ${recentResponse.statusText}`);
			}

			recentTracks = await recentResponse.json();

		} catch (e) {
			error = `Failed to fetch data: ${e}`;
		} finally {
			loading = false;
		}
	}

	function extractTopArtists() {
		if (!replayData?.data) return [];

		const artistsMap = new Map();

		for (const item of replayData.data) {
			if (item.type === 'artists' && item.attributes) {
				const name = item.attributes.name;
				const playCount = item.attributes.playCount || 0;
				const playDuration = item.attributes.playDuration || 0;

				artistsMap.set(name, {
					name,
					playCount,
					playDuration,
					durationMinutes: Math.round(playDuration / 60000)
				});
			}
		}

		return Array.from(artistsMap.values())
			.sort((a, b) => b.playCount - a.playCount)
			.slice(0, 20);
	}

	$effect(() => {
		if (replayData) {
			console.log('Replay data:', replayData);
		}
	});
</script>

<div class="container">
	<h1>Apple Music Replay Viewer</h1>

	{#if !$musicKitStore.isLoaded}
		<p>Loading MusicKit...</p>
	{:else if !$musicKitStore.isConfigured}
		<div class="token-input">
			<h2>Step 1: Enter Developer Token</h2>
			<p>Get your token from Apple Music console: <code>MusicKit.getInstance().developerToken</code></p>
			<input
				type="text"
				bind:value={devToken}
				placeholder="Enter your developer token"
			/>
			<button onclick={configureMusicKit}>Configure MusicKit</button>
		</div>
	{:else if !$musicKitStore.isAuthorized}
		<div class="auth-section">
			<h2>Step 2: Authorize</h2>
			<p>Click to authorize with your Apple Music account</p>
			<button onclick={authorize} disabled={loading}>
				{loading ? 'Authorizing...' : 'Login to Apple Music'}
			</button>
		</div>
	{:else}
		<div class="data-section">
			<h2>Step 3: Get Your Replay Data</h2>
			<button onclick={getReplayData} disabled={loading}>
				{loading ? 'Fetching...' : 'Get Replay Data'}
			</button>
		</div>

		{#if replayData || recentTracks}
			<div class="results">
				<h2>Top Artists</h2>
				{#if extractTopArtists().length > 0}
					<div class="artists-list">
						{#each extractTopArtists() as artist, i}
							<div class="artist-item">
								<span class="rank">#{i + 1}</span>
								<div class="artist-info">
									<strong>{artist.name}</strong>
									<span class="stats">
										{artist.playCount} plays • {artist.durationMinutes} minutes
									</span>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p>No artist data available</p>
				{/if}

				<details>
					<summary>Raw Replay Data</summary>
					<pre>{JSON.stringify(replayData, null, 2)}</pre>
				</details>

				<details>
					<summary>Raw Recent Tracks Data</summary>
					<pre>{JSON.stringify(recentTracks, null, 2)}</pre>
				</details>
			</div>
		{/if}
	{/if}

	{#if error}
		<div class="error">{error}</div>
	{/if}
</div>

<style>
	.container {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
		font-family: system-ui, -apple-system, sans-serif;
	}

	h1 {
		color: #fc3c44;
		margin-bottom: 2rem;
	}

	h2 {
		margin-top: 2rem;
		margin-bottom: 1rem;
	}

	.token-input,
	.auth-section,
	.data-section {
		margin: 2rem 0;
		padding: 1.5rem;
		border: 1px solid #ddd;
		border-radius: 8px;
		background: #f9f9f9;
	}

	input[type="text"] {
		width: 100%;
		padding: 0.75rem;
		margin: 1rem 0;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 14px;
		font-family: monospace;
	}

	button {
		background: #fc3c44;
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
		font-weight: 500;
	}

	button:hover:not(:disabled) {
		background: #e5353d;
	}

	button:disabled {
		background: #ccc;
		cursor: not-allowed;
	}

	code {
		background: #f0f0f0;
		padding: 0.2rem 0.4rem;
		border-radius: 3px;
		font-family: monospace;
		font-size: 0.9em;
	}

	.results {
		margin-top: 2rem;
	}

	.artists-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin: 1rem 0;
	}

	.artist-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: white;
		border: 1px solid #eee;
		border-radius: 8px;
	}

	.rank {
		font-size: 1.5rem;
		font-weight: bold;
		color: #fc3c44;
		min-width: 3rem;
		text-align: center;
	}

	.artist-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stats {
		font-size: 0.9rem;
		color: #666;
	}

	.error {
		margin-top: 1rem;
		padding: 1rem;
		background: #fee;
		border: 1px solid #fcc;
		border-radius: 4px;
		color: #c00;
	}

	details {
		margin-top: 2rem;
		padding: 1rem;
		border: 1px solid #ddd;
		border-radius: 4px;
	}

	summary {
		cursor: pointer;
		font-weight: 500;
		padding: 0.5rem;
	}

	pre {
		overflow: auto;
		padding: 1rem;
		background: #f5f5f5;
		border-radius: 4px;
		font-size: 0.85rem;
		line-height: 1.4;
	}
</style>
