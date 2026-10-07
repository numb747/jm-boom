use super::*;
use crate::plugin_codec::decode_setting_payload;
use crate::storage::runtime_cache;
use std::time::Duration;

const ENDPOINT_DISCOVERY_CACHE_KIND: &str = "endpoint_discovery";
const ENDPOINT_DISCOVERY_CACHE_KEY: &str = "endpoint_discovery:v1";
const IMG_HOST_CACHE_KIND: &str = "img_host";
const ENDPOINT_DISCOVERY_CACHE_TTL: Duration = Duration::from_secs(30 * 60);
const IMG_HOST_CACHE_TTL: Duration = Duration::from_secs(30 * 60);

pub async fn get_remote_setting(endpoint: Option<String>) -> ApiResult<RemoteSettingResult> {
    let endpoint = resolve_api_endpoint(endpoint)?;
    let client = build_http_client()?;
    let auth = SettingAuth::current();
    let img_host = request_remote_img_host(&client, &endpoint, &auth).await?;

    Ok(RemoteSettingResult { endpoint, img_host })
}

pub async fn discover_api_endpoints() -> ApiResult<Vec<ApiEndpointProbe>> {
    if let Some(probes) = runtime_cache_get::<Vec<ApiEndpointProbe>>(
        ENDPOINT_DISCOVERY_CACHE_KIND,
        ENDPOINT_DISCOVERY_CACHE_KEY,
    )
    .await
    {
        return Ok(probes);
    }

    let client = create_http_client()?;
    let mut candidates = discover_api_endpoint_candidates(&client).await?;

    if candidates.is_empty() {
        candidates.push(DEFAULT_API_ENDPOINT.to_string());
    }

    let auth = SettingAuth::current();
    let mut probes = Vec::with_capacity(candidates.len());

    for endpoint in candidates {
        let started_at = Instant::now();
        let result = request_remote_setting(&client, &endpoint, &auth).await;
        let latency_ms = started_at.elapsed().as_millis() as u64;

        probes.push(match result {
            Ok(setting) => ApiEndpointProbe {
                endpoint,
                available: true,
                latency_ms: Some(latency_ms),
                img_host: Some(setting.img_host),
                error: None,
            },
            Err(error) => ApiEndpointProbe {
                endpoint,
                available: false,
                latency_ms: None,
                img_host: None,
                error: Some(error.to_string()),
            },
        });
    }

    probes.sort_by(|left, right| match (left.available, right.available) {
        (true, true) => left
            .latency_ms
            .unwrap_or(u64::MAX)
            .cmp(&right.latency_ms.unwrap_or(u64::MAX)),
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        (false, false) => left.endpoint.cmp(&right.endpoint),
    });

    if probes.iter().any(|probe| probe.available) {
        runtime_cache_set(
            ENDPOINT_DISCOVERY_CACHE_KIND,
            ENDPOINT_DISCOVERY_CACHE_KEY,
            &probes,
            ENDPOINT_DISCOVERY_CACHE_TTL,
        )
        .await;
    }

    Ok(probes)
}

pub(crate) async fn request_remote_setting(
    client: &reqwest::Client,
    endpoint: &str,
    auth: &SettingAuth,
) -> ApiResult<RemoteSettingPayload> {
    let request_name = format!("{endpoint}/setting");
    let response = client
        .get(&request_name)
        .header("Tokenparam", &auth.tokenparam)
        .header("Token", &auth.token)
        .query(&[("app_img_shunt", "1"), ("t", auth.ts.as_str())])
        .send()
        .await
        .map_err(|error| {
            ApiError::new(ApiErrorKind::Network, format!("{request_name}: {error}"))
        })?;

    if !response.status().is_success() {
        return Err(ApiError::new(
            ApiErrorKind::Http,
            format!("{request_name}: API returned HTTP {}", response.status()),
        ));
    }

    let body = response.text().await.map_err(|error| {
        ApiError::new(ApiErrorKind::Network, format!("{request_name}: {error}"))
    })?;

    decode_setting_payload::<RemoteSettingPayload>(trim_response_body(&body), &auth.ts).map_err(|error| {
        ApiError::new(
            ApiErrorKind::Payload,
            format!(
                "{request_name}: Invalid setting payload: {error}. Body starts with: {}",
                response_preview(&body)
            ),
        )
    })
}

pub(crate) async fn request_remote_img_host(
    client: &reqwest::Client,
    endpoint: &str,
    auth: &SettingAuth,
) -> ApiResult<String> {
    if let Some(img_host) = cached_img_host(endpoint) {
        return Ok(img_host);
    }

    if let Some(img_host) =
        runtime_cache_get::<String>(IMG_HOST_CACHE_KIND, &img_host_cache_key(endpoint)).await
    {
        cache_img_host(endpoint, &img_host);
        return Ok(img_host);
    }

    let setting = request_remote_setting(client, endpoint, auth).await?;
    cache_img_host(endpoint, &setting.img_host);
    runtime_cache_set(
        IMG_HOST_CACHE_KIND,
        &img_host_cache_key(endpoint),
        &setting.img_host,
        IMG_HOST_CACHE_TTL,
    )
    .await;

    Ok(setting.img_host)
}

pub(crate) async fn resolve_cached_img_host(
    client: &reqwest::Client,
    endpoint: &str,
) -> ApiResult<String> {
    let auth = SettingAuth::current();

    request_remote_img_host(client, endpoint, &auth).await
}

pub(crate) async fn discover_api_endpoint_candidates(
    client: &reqwest::Client,
) -> ApiResult<Vec<String>> {
    let mut candidates = FALLBACK_API_ENDPOINTS
        .iter()
        .filter_map(|endpoint| normalize_api_endpoint(endpoint).ok())
        .collect::<Vec<_>>();

    match fetch_host_config(client).await {
        Ok(hosts) => {
            candidates.extend(
                hosts
                    .into_iter()
                    .filter_map(|host| normalize_api_endpoint(&host).ok()),
            );
        }
        Err(error) => {
            tracing::warn!(
                error = %error,
                "failed to load JM host config, using fallback endpoints only"
            );
        }
    }

    let mut unique = Vec::new();
    for endpoint in candidates {
        if !unique.contains(&endpoint) {
            unique.push(endpoint);
        }
    }

    Ok(unique)
}

pub(crate) async fn fetch_host_config(client: &reqwest::Client) -> ApiResult<Vec<String>> {
    let mut last_error = None;

    for url in HOST_CONFIG_URLS {
        match fetch_host_config_from_url(client, url).await {
            Ok(hosts) => return Ok(hosts),
            Err(error) => last_error = Some(error),
        }
    }

    Err(last_error.unwrap_or_else(|| {
        ApiError::new(ApiErrorKind::Network, "JM host config urls are unavailable")
    }))
}

pub(crate) async fn fetch_host_config_from_url(
    client: &reqwest::Client,
    url: &str,
) -> ApiResult<Vec<String>> {
    let response = client
        .get(url)
        .header("accept", "text/plain,*/*")
        .send()
        .await
        .map_err(|error| ApiError::new(ApiErrorKind::Network, format!("{url}: {error}")))?;

    if !response.status().is_success() {
        return Err(ApiError::new(
            ApiErrorKind::Http,
            format!("{url}: host config returned HTTP {}", response.status()),
        ));
    }

    let body = response
        .text()
        .await
        .map_err(|error| ApiError::new(ApiErrorKind::Network, format!("{url}: {error}")))?;
    let normalized = body
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '/' | '='))
        .collect::<String>();
    let key = md5_hex(HOST_CONFIG_AES_SEED);
    let decrypted = decrypt_base64_with_key(&normalized, &key).map_err(|error| {
        ApiError::new(
            ApiErrorKind::Decrypt,
            format!("{url}: failed to decrypt host config: {error}"),
        )
    })?;
    let payload = serde_json::from_str::<HostConfigPayload>(&decrypted).map_err(|error| {
        ApiError::new(
            ApiErrorKind::Payload,
            format!("{url}: invalid host config payload: {error}"),
        )
    })?;

    Ok(payload.server)
}

pub(crate) fn cached_img_host(endpoint: &str) -> Option<String> {
    let mut cache = IMG_HOST_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .ok()?;
    let entry = cache.get(endpoint)?;
    if entry.expires_at <= current_timestamp_secs() {
        cache.remove(endpoint);
        return None;
    }

    Some(entry.value.clone())
}

pub(crate) fn cache_img_host(endpoint: &str, img_host: &str) {
    if let Ok(mut cache) = IMG_HOST_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
    {
        cache.insert(
            endpoint.to_string(),
            ImgHostCacheEntry {
                value: img_host.to_string(),
                expires_at: current_timestamp_secs().saturating_add(IMG_HOST_CACHE_TTL.as_secs()),
            },
        );
    }
}

fn img_host_cache_key(endpoint: &str) -> String {
    format!("img_host:{endpoint}")
}

fn current_timestamp_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

async fn runtime_cache_get<T>(cache_kind: &str, cache_key: &str) -> Option<T>
where
    T: serde::de::DeserializeOwned,
{
    match runtime_cache::get(cache_kind, cache_key).await {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!(
                cache_kind = %cache_kind,
                cache_key = %cache_key,
                error = %error,
                "failed to read runtime cache"
            );
            None
        }
    }
}

async fn runtime_cache_set<T>(cache_kind: &str, cache_key: &str, value: &T, ttl: Duration)
where
    T: serde::Serialize,
{
    if let Err(error) = runtime_cache::set(cache_kind, cache_key, value, ttl).await {
        tracing::warn!(
            cache_kind = %cache_kind,
            cache_key = %cache_key,
            error = %error,
            "failed to write runtime cache"
        );
    }
}
