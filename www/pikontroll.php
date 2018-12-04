<?php
    $pikontrollcli = "/usr/local/bin/pikontroll-cli";
    if (isset($_GET['cmd'])) {
        $exit_status = 0;
        $output = exec($pikontrollcli . ' ' . escapeshellarg($_GET['cmd']), $out, $exit_status);
        if ($exit_status == 0) {
            echo $output;
        } else {
            header('HTTP/1.1 500 Server Error');
        }
    } else {
        header('HTTP/1.1 400 Bad Request');
    }
?>
