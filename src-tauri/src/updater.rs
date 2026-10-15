use crate::api::{self, ApiError, ApiErrorDto, ApiErrorKind, ApiResult};
use crate::storage::runtime_cache;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_updater::Updater;
use tauri_plugin_updater::UpdaterExt;
use url::Url;

const APP_UPDATE_CACHE_KIND: &str = "app_update_check";
const APP_UPDATE_CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateCheckResult {
    pub current_version: String,
    pub available: bool,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
}

type UpdateCommandResult<T> = Result<T, ApiErrorDto>;

#[tauri::command]
pub async fn check_app_update(
    app: AppHandle,
    force: Option<bool>,
) -> UpdateCommandResult<AppUpdateCheckResult> {
    let current_version = app.package_info().version.to_string();
    let cache_key = app_update_cache_key(&current_version);

    if !force.unwrap_or(false) {
        if let Some(cached) = runtime_cache_get::<AppUpdateCheckResult>(&cache_key).await {
            return Ok(cached);
        }
    }

    let updater = build_updater(&app).map_err(ApiErrorDto::from)?;

    let update = updater.check().await.map_err(|error| {
        ApiErrorDto::new(ApiErrorKind::Network, format!("检查更新失败: {error}"))
    })?;

    let result = match update {
        Some(update) => AppUpdateCheckResult {
            current_version,
            available: true,
            version: Some(update.version),
            notes: update.body,
            pub_date: update.date.map(|date| date.to_string()),
        },
        None => AppUpdateCheckResult {
            current_version,
            available: false,
            version: None,
            notes: None,
            pub_date: None,
        },
    };

    runtime_cache_set(&cache_key, &result, APP_UPDATE_CACHE_TTL).await;

    Ok(result)
}

#[tauri::command]
pub async fn install_app_update(app: AppHandle) -> UpdateCommandResult<bool> {
    // Outside an AppImage the binary is owned by the system package manager
    // (pacman/AUR, deb, rpm), so the in-app updater must not overwrite it.
    if cfg!(target_os = "linux") && std::env::var_os("APPIMAGE").is_none() {
        return Err(ApiErrorDto::new(
            ApiErrorKind::Client,
            "当前版本由系统包管理器安装，请通过包管理器（如 pacman / AUR 助手、apt、dnf）更新",
        ));
    }

    let updater = build_updater(&app).map_err(ApiErrorDto::from)?;

    let Some(update) = updater.check().await.map_err(|error| {
        ApiErrorDto::new(ApiErrorKind::Network, format!("检查更新失败: {error}"))
    })?
    else {
        return Ok(false);
    };

    let bytes = update.download(|_, _| {}, || {}).await.map_err(|error| {
        ApiErrorDto::new(ApiErrorKind::Network, format!("下载更新失败: {error}"))
    })?;

    update
        .install(bytes)
        .map_err(|error| ApiErrorDto::new(ApiErrorKind::Cache, format!("安装更新失败: {error}")))?;

    #[cfg(not(target_os = "windows"))]
    app.restart();

    Ok(true)
}

fn build_updater(app: &AppHandle) -> ApiResult<Updater> {
    let mut builder = app.updater_builder();

    if let Some(proxy_url) = api::current_proxy_url()? {
        let proxy = Url::parse(&proxy_url).map_err(|error| {
            ApiError::new(
                ApiErrorKind::UnsupportedEndpoint,
                format!("解析更新代理失败 {proxy_url}: {error}"),
            )
        })?;
        builder = builder.proxy(proxy);
    }

    builder
        .build()
        .map_err(|error| ApiError::new(ApiErrorKind::Client, format!("初始化更新器失败: {error}")))
}

fn app_update_cache_key(current_version: &str) -> String {
    format!("app_update_check:v1:{current_version}")
}

async fn runtime_cache_get<T>(cache_key: &str) -> Option<T>
where
    T: serde::de::DeserializeOwned,
{
    match runtime_cache::get(APP_UPDATE_CACHE_KIND, cache_key).await {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!(
                cache_kind = APP_UPDATE_CACHE_KIND,
                cache_key = %cache_key,
                error = %error,
                "failed to read app update cache"
            );
            None
        }
    }
}

async fn runtime_cache_set<T>(cache_key: &str, value: &T, ttl: Duration)
where
    T: Serialize,
{
    if let Err(error) = runtime_cache::set(APP_UPDATE_CACHE_KIND, cache_key, value, ttl).await {
        tracing::warn!(
            cache_kind = APP_UPDATE_CACHE_KIND,
            cache_key = %cache_key,
            error = %error,
            "failed to write app update cache"
        );
    }
}
