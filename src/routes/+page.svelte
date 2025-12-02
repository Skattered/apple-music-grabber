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

	async function configureMusicKit() {
		if (!devToken.trim()) {
			error = 'Please enter a developer token';
			return;
		}

		try {
			const musicKit = (window as any).MusicKit;
			await musicKit.configure({
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

			// Try to authorize - this will likely fail with storefront error
			let musicUserToken;
			try {
				musicUserToken = await instance.authorize();
			} catch (authError: any) {
				console.log('Auth error, checking if token was set anyway:', authError);

				// Check if token exists despite error
				if (instance.musicUserToken) {
					musicUserToken = instance.musicUserToken;
					console.log('Found token on instance despite error!');
				} else {
					// If no token, re-throw
					throw authError;
				}
			}

			if (musicUserToken) {
				musicKitStore.update(state => ({
					...state,
					isAuthorized: true,
					musicUserToken: musicUserToken
				}));
			} else {
				throw new Error('No music user token obtained');
			}
		} catch (e: any) {
			error = `Authorization failed: ${e?.message || e}`;
		} finally {
			loading = false;
		}
	}

	async function getReplayData() {
		loading = true;
		error = '';
		replayData = null;
		recentTracks = null;

		console.log('[DATA] Starting data fetch...');

		try {
			const { developerToken, musicUserToken } = $musicKitStore;
			console.log('[DATA] Using dev token:', developerToken?.substring(0, 20) + '...');
			console.log('[DATA] Using user token:', musicUserToken?.substring(0, 20) + '...');

			const headers = {
				'Authorization': `Bearer ${developerToken}`,
				'Music-User-Token': musicUserToken
			};

			// Fetch Replay/Music Summaries data
			console.log('[DATA] Fetching music summaries (Replay data)...');
			const replayResponse = await fetch(
				'https://api.music.apple.com/v1/me/music-summaries?filter[year]=latest&views=top-artists,top-albums,top-songs',
				{ headers }
			);

			console.log(`[DATA] Replay response status: ${replayResponse.status}`);

			if (!replayResponse.ok) {
				const errorText = await replayResponse.text();
				console.error(`[DATA] Replay error response: ${errorText}`);
				throw new Error(`Replay API failed: ${replayResponse.status} ${replayResponse.statusText}`);
			}

			replayData = await replayResponse.json();
			console.log('[DATA] Replay data received:', replayData);

			// Also fetch recent tracks
			console.log('[DATA] Fetching recent tracks...');
			const allTracks = [];

			for (let offset = 0; offset < 50; offset += 10) {
				console.log(`[DATA] Fetching batch with offset ${offset}...`);
				const recentResponse = await fetch(
					`https://api.music.apple.com/v1/me/recent/played/tracks?limit=10&offset=${offset}`,
					{ headers }
				);

				console.log(`[DATA] Response status: ${recentResponse.status}`);

				if (!recentResponse.ok) {
					const errorText = await recentResponse.text();
					console.error(`[DATA] Error response: ${errorText}`);
					throw new Error(`Recent tracks API failed: ${recentResponse.status} ${recentResponse.statusText}`);
				}

				const batch = await recentResponse.json();
				console.log(`[DATA] Received ${batch.data?.length || 0} tracks`);

				if (batch.data && batch.data.length > 0) {
					allTracks.push(...batch.data);
				} else {
					console.log('[DATA] No more tracks, stopping pagination');
					break;
				}
			}

			recentTracks = { data: allTracks };
			console.log(`[DATA] Total tracks fetched: ${allTracks.length}`);

		} catch (e) {
			console.error('[DATA] Fetch error:', e);
			error = `Failed to fetch data: ${e}`;
		} finally {
			loading = false;
		}
	}

	function extractTopArtists() {
		if (!replayData?.data?.[0]?.views) return [];

		const topArtistsView = replayData.data[0].views.find((v: any) => v.id === 'top-artists');
		if (!topArtistsView?.data) return [];

		return topArtistsView.data.map((item: any, index: number) => ({
			rank: index + 1,
			name: item.attributes?.name || 'Unknown',
			playCount: item.attributes?.playCount || 0,
			artworkUrl: item.attributes?.artwork?.url || ''
		}));
	}

	function extractTopSongs() {
		if (!replayData?.data?.[0]?.views) return [];

		const topSongsView = replayData.data[0].views.find((v: any) => v.id === 'top-songs');
		if (!topSongsView?.data) return [];

		return topSongsView.data.map((item: any, index: number) => ({
			rank: index + 1,
			title: item.attributes?.name || 'Unknown',
			artist: item.attributes?.artistName || 'Unknown',
			playCount: item.attributes?.playCount || 0
		}));
	}

	function extractRecentTracks() {
		if (!recentTracks?.data) return [];

		return recentTracks.data.map((item: any) => ({
			title: item.attributes?.name || 'Unknown',
			artist: item.attributes?.artistName || 'Unknown',
			album: item.attributes?.albumName || 'Unknown',
			playedAt: item.attributes?.playParams?.playlistId || ''
		}));
	}

	$effect(() => {
		if (replayData) {
			console.log('[DATA] Replay data:', replayData);
		}
		if (recentTracks) {
			console.log('[DATA] Recent tracks data:', recentTracks);
		}
	});
</script>

<div class="container">
	<h1>Apple Music Replay Grabber</h1>

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
				{loading ? 'Fetching...' : 'Get Replay & Recent Tracks'}
			</button>
		</div>

		{#if replayData}
			<div class="results">
				<h2>Your Replay {replayData.data?.[0]?.attributes?.year || ''}</h2>

				{#if extractTopArtists().length > 0}
					<h3>Top Artists</h3>
					<div class="tracks-list">
						{#each extractTopArtists() as artist}
							<div class="track-item">
								<span class="track-number">#{artist.rank}</span>
								<div class="track-info">
									<strong>{artist.name}</strong>
									<span class="track-meta">{artist.playCount} plays</span>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				{#if extractTopSongs().length > 0}
					<h3>Top Songs</h3>
					<div class="tracks-list">
						{#each extractTopSongs() as song}
							<div class="track-item">
								<span class="track-number">#{song.rank}</span>
								<div class="track-info">
									<strong>{song.title}</strong>
									<span class="track-meta">{song.artist} • {song.playCount} plays</span>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<details>
					<summary>Raw Replay Data</summary>
					<pre>{JSON.stringify(replayData, null, 2)}</pre>
				</details>
			</div>
		{/if}

		{#if recentTracks}
			<div class="results">
				<h2>Recent Tracks ({extractRecentTracks().length} total)</h2>
				{#if extractRecentTracks().length > 0}
					<div class="tracks-list">
						{#each extractRecentTracks() as track, i}
							<div class="track-item">
								<span class="track-number">{i + 1}</span>
								<div class="track-info">
									<strong>{track.title}</strong>
									<span class="track-meta">
										{track.artist} • {track.album}
									</span>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p>No tracks found</p>
				{/if}

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

	.tracks-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 1rem 0;
	}

	.track-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem;
		background: white;
		border: 1px solid #eee;
		border-radius: 8px;
	}

	.track-number {
		font-size: 1rem;
		font-weight: bold;
		color: #999;
		min-width: 2rem;
		text-align: right;
	}

	.track-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.track-meta {
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
