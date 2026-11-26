<?php
header('Content-Type: application/json');

$ordersCount = 0;
$productsCount = 0;
$categoriesCount = 0;
$usersCount = 0;

// Replace the following lines with actual queries to fetch data from the database
// $ordersCount = ...;
// $productsCount = ...;
// $categoriesCount = ...;
// $usersCount = ...;

$response = array(
    "ordersCount" => $ordersCount,
    "productsCount" => $productsCount,
    "categoriesCount" => $categoriesCount,
    "usersCount" => $usersCount
);

echo json_encode($response);
