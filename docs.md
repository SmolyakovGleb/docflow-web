# Create data store entity.add

{% note tip "" %}

If you develop integrations for Bitrix24 using AI tools (Codex, Claude Code, Cursor), connect the [MCP server](../../../sdk/mcp.md) to let the assistant use the official REST documentation.

{% endnote %}

> Scope: [`entity`](../../scopes/permissions.md)
>
> Who can execute the method: user authorized in the application

The `entity.add` method creates a new application data store.

{% note info "" %}

The method works only in the context of an [application](../../../settings/app-installation/index.md).

{% endnote %}


## Method Parameters

{% include [Note on parameters](../../../_includes/required.md) %}

#|
|| **Name**
`type` | **Description** ||
|| **ENTITY**^*^
[`string`](../../data-types.md) | Character identifier of the data store. Use this value in other methods of the section after creating the data store.

The following characters are allowed: a-z, A-Z, `0-9`, `_`.

The length limit is calculated dynamically using the formula:
`50 - strlen("APP_<clientId>_")`. In most cases for Bitrix24, this is 13 characters. ||
|| **NAME**^*^
[`string`](../../data-types.md) | Data store name ||
|| **ACCESS**
[`object`](../../data-types.md) | Access permissions in `{"access_code":"permission_level"}` format.

Access code examples:
- `U<id>` — a user, for example `U1`
- `G<id>` — a user group, for example `G2`
- `AU` — all authorized users

The method accepts standard Bitrix24 access codes. You can check the code name using the [access.name](../../common/system/access-name.md) method.

Supported levels:
- `R` — read
- `W` — write
- `X` — manage

If another level is passed, such a permission will not be added.

The data store creator is automatically granted `X` (`U<id>`) permission.||
|#  

## Code Examples

{% include [Note on examples](../../../_includes/examples.md) %}

Example of creating a data store where:
- `ENTITY` — data store identifier `dish`
- `NAME` — data store name `Dishes`
- `ACCESS` — access permissions: `U1` with level `W` and `AU` with level `R`

{% list tabs %}

- cURL (OAuth)

    ```bash
    curl -X POST \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d '{"ENTITY":"dish","NAME":"Dishes","ACCESS":{"U1":"W","AU":"R"},"auth":"**put_access_token_here**"}' \
    https://**put_your_bitrix24_address**/rest/entity.add
    ```

- JS

    ```js
    try
    {
    	const response = await $b24.callMethod(
    		'entity.add',
    		{
    			ENTITY: 'dish',
    			NAME: 'Dishes',
    			ACCESS: {
    				U1: 'W',
    				AU: 'R',
    			},
    		}
    	);

    	const result = response.getData().result;
    	console.info(result);
    }
    catch (error)
    {
    	console.error('Error:', error);
    }
    ```

- PHP

    ```php
    try {
        $response = $b24Service
            ->core
            ->call(
                'entity.add',
                [
                    'ENTITY' => 'dish',
                    'NAME' => 'Dishes',
                    'ACCESS' => [
                        'U1' => 'W',
                        'AU' => 'R',
                    ],
                ]
            );

        $result = $response
            ->getResponseData()
            ->getResult();

        echo '<pre>';
        print_r($result);
        echo '</pre>';

    } catch (Throwable $e) {
        error_log($e->getMessage());
        echo 'Error adding entity: ' . $e->getMessage();
    }
    ```

- BX24.js

    ```js
    BX24.callMethod(
        'entity.add',
        {
            ENTITY: 'dish',
            NAME: 'Dishes',
            ACCESS: {
                U1: 'W',
                AU: 'R',
            },
        },
        (result) => {
            result.error()
                ? console.error(result.error())
                : console.info(result.data())
            ;
        },
    );
    ```

- PHP CRest

    ```php
    require_once('crest.php');

    $result = CRest::call(
        'entity.add',
        [
            'ENTITY' => 'dish',
            'NAME' => 'Dishes',
            'ACCESS' => [
                'U1' => 'W',
                'AU' => 'R',
            ],
        ]
    );

    echo '<PRE>';
    print_r($result);
    echo '</PRE>';
    ```

{% endlist %}

## Response Handling

HTTP status: **200**

```json
{
    "result": true,
    "time": {
        "start": 1774255192,
        "finish": 1774255192.416864,
        "duration": 0.41686391830444336,
        "processing": 0,
        "date_start": "2026-03-23T11:39:52+03:00",
        "date_finish": "2026-03-23T11:39:52+03:00",
        "operating_reset_at": 1774255792,
        "operating": 0.11449217796325684
    }
}
```

### Returned Data

#|
|| **Name**
`type` | **Description** ||
|| **result**
[`boolean`](../../data-types.md) | The result of the method execution. For successful creation, `true` is returned. ||
|| **time**
[`time`](../../data-types.md#time) | Information about the request execution time ||
|#

## Error Handling

HTTP status: **400**

```json
{
    "error": "ERROR_ARGUMENT",
    "error_description": "Argument 'ENTITY' is null or empty",
    "argument": "ENTITY"
}
```

{% include notitle [Error handling](../../../_includes/error-info.md) %}

### Possible Error Codes

#|
|| **Code** | **Description** | **Value** ||
|| `ERROR_ENTITY_ALREADY_EXISTS` | Entity already exists | A data store with this `ENTITY` already exists ||
|| `ERROR_CORE` | Internal error adding entity. Try adding again. | Internal error during data store creation ||
|| `ERROR_ARGUMENT` | Argument 'ENTITY' is null or empty | Parameter `ENTITY` was not passed or is empty after clearing ||
|| `ERROR_ARGUMENT` | Entity code is too long. Max length is N characters. | The `ENTITY` value is too long ||
|| `ACCESS_DENIED` | Access denied! Application context required | No application context (`clientId`) ||
|#

{% include [System errors](../../../_includes/system-errors.md) %}

## Continue Learning

- [{#T}](./entity-update.md)
- [{#T}](./entity-get.md)
- [{#T}](./entity-delete.md)
- [{#T}](./entity-rights.md)