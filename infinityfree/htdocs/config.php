<?php
/**
 * Copy to htdocs/config.php and fill in your InfinityFree MySQL credentials.
 * In phpMyAdmin: create database first (e.g. if0_42161260_tracker).
 */
return [
    'db_host' => 'sql210.infinityfree.com',
    'db_name' => 'if0_42161260_tracker',
    'db_user' => 'if0_42161260',
    'db_pass' => 'YOUR_MYSQL_PASSWORD',

    'dashboard_api_key' => 'your-long-random-secret',
    'cron_secret' => 'your-cron-secret',

    'app_url' => 'https://trackk.k12hunar.com',
    'allowed_origins' => [
        'https://trackk.k12hunar.com',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
    ],

    'vapid_public_key' => '',
    'vapid_private_key' => '',
    'vapid_subject' => 'mailto:tracker@example.com',
];
