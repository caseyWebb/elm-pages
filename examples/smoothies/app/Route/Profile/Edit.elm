module Route.Profile.Edit exposing (ActionData, Data, Model, Msg, route)

import Api.Scalar exposing (Uuid(..))
import Data.User as User exposing (User)
import DataSource exposing (DataSource)
import Dict exposing (Dict)
import Effect exposing (Effect)
import ErrorPage exposing (ErrorPage)
import Form
import Form.Field as Field
import Form.FieldView as FieldView
import Form.Validation as Validation
import Form.Value
import Head
import Head.Seo as Seo
import Html exposing (Html)
import Html.Attributes as Attr
import MySession
import Pages.FormState
import Pages.Msg
import Pages.PageUrl exposing (PageUrl)
import Pages.Url
import Path exposing (Path)
import Request.Hasura
import Route
import RouteBuilder exposing (StatefulRoute, StatelessRoute, StaticPayload)
import Server.Request as Request
import Server.Response as Response exposing (Response)
import Server.Session as Session
import Shared
import View exposing (View)


type alias Model =
    {}


type Msg
    = NoOp


type alias RouteParams =
    {}


route : StatefulRoute RouteParams Data ActionData Model Msg
route =
    RouteBuilder.serverRender
        { head = head
        , data = data
        , action = action
        }
        |> RouteBuilder.buildWithLocalState
            { view = view
            , update = update
            , subscriptions = subscriptions
            , init = init
            }


init :
    Maybe PageUrl
    -> Shared.Model
    -> StaticPayload Data ActionData RouteParams
    -> ( Model, Effect Msg )
init maybePageUrl sharedModel static =
    ( {}
    , Effect.none
    )


update :
    PageUrl
    -> Shared.Model
    -> StaticPayload Data ActionData RouteParams
    -> Msg
    -> Model
    -> ( Model, Effect Msg )
update pageUrl sharedModel static msg model =
    case msg of
        NoOp ->
            ( model, Effect.none )


subscriptions : Maybe PageUrl -> RouteParams -> Path -> Shared.Model -> Model -> Sub Msg
subscriptions maybePageUrl routeParams path sharedModel model =
    Sub.none


type alias Data =
    { user : User
    }


type alias ActionData =
    Result { fields : List ( String, String ), errors : Dict String (List String) } Action


data : RouteParams -> Request.Parser (DataSource (Response Data ErrorPage))
data routeParams =
    Request.requestTime
        |> MySession.expectSessionDataOrRedirect (Session.get "userId")
            (\userId requestTime session ->
                User.selection userId
                    |> Request.Hasura.dataSource requestTime
                    |> DataSource.map
                        (\user ->
                            user
                                |> Data
                                |> Response.render
                                |> Tuple.pair session
                        )
            )


type alias Action =
    { username : String
    , name : String
    }


formParser : Form.HtmlForm String Action Data msg
formParser =
    Form.init
        (\username name ->
            Validation.succeed Action
                |> Validation.andMap username
                |> Validation.andMap name
        )
        (\info username name ->
            let
                errors field =
                    info.errors
                        |> Dict.get field.name
                        |> Maybe.withDefault []

                errorsView field =
                    (if field.status == Pages.FormState.Blurred then
                        field
                            |> errors
                            |> List.map (\error -> Html.li [] [ Html.text error ])

                     else
                        []
                    )
                        |> Html.ul [ Attr.style "color" "red" ]
            in
            ( [ Attr.style "display" "flex"
              , Attr.style "flex-direction" "column"
              , Attr.style "gap" "20px"
              ]
            , [ Html.div
                    []
                    [ Html.label [] [ Html.text "Username ", username |> FieldView.input [] ]
                    , errorsView username
                    ]
              , Html.div []
                    [ Html.label [] [ Html.text "Name ", name |> FieldView.input [] ]
                    , errorsView name
                    ]
              , Html.button []
                    [ Html.text <|
                        if info.isTransitioning then
                            "Updating..."

                        else
                            "Update"
                    ]
              ]
            )
        )
        |> Form.field "username"
            (Field.text
                |> Field.required "Username is required"
                |> Field.withClientValidation validateUsername
                |> Field.withServerValidation
                    (\username ->
                        DataSource.succeed
                            (if username == "dillon123" then
                                [ "This username is taken" ]

                             else
                                []
                            )
                    )
                |> Field.withInitialValue (\{ user } -> Form.Value.string user.username)
            )
        |> Form.field "name"
            (Field.text
                |> Field.required "Name is required"
                |> Field.withInitialValue (\{ user } -> Form.Value.string user.name)
            )


validateUsername : String -> ( Maybe String, List String )
validateUsername rawUsername =
    if rawUsername |> String.contains "@" then
        ( Just rawUsername, [ "Cannot contain @" ] )

    else
        ( Just rawUsername, [] )


action : RouteParams -> Request.Parser (DataSource (Response ActionData ErrorPage))
action routeParams =
    Request.map2 Tuple.pair
        (Request.formData [ formParser ])
        Request.requestTime
        |> MySession.expectSessionDataOrRedirect (Session.get "userId" >> Maybe.map Uuid)
            (\userId ( parsedActionData, requestTime ) session ->
                parsedActionData
                    |> DataSource.andThen
                        (\parsedAction ->
                            case parsedAction |> Debug.log "parsedAction" of
                                Ok { name } ->
                                    User.updateUser { userId = userId, name = name |> Debug.log "Updating name mutation" }
                                        |> Request.Hasura.mutationDataSource requestTime
                                        |> DataSource.map
                                            (\_ ->
                                                Route.redirectTo Route.Profile
                                            )
                                        |> DataSource.map (Tuple.pair session)

                                Err errors ->
                                    -- TODO need to render errors here?
                                    DataSource.succeed
                                        (Response.render parsedAction)
                                        |> DataSource.map (Tuple.pair session)
                        )
            )


head :
    StaticPayload Data ActionData RouteParams
    -> List Head.Tag
head static =
    Seo.summary
        { canonicalUrlOverride = Nothing
        , siteName = "elm-pages"
        , image =
            { url = Pages.Url.external "TODO"
            , alt = "elm-pages logo"
            , dimensions = Nothing
            , mimeType = Nothing
            }
        , description = "Update your profile"
        , locale = Nothing
        , title = "Profile"
        }
        |> Seo.website


view :
    Maybe PageUrl
    -> Shared.Model
    -> Model
    -> StaticPayload Data ActionData RouteParams
    -> View (Pages.Msg.Msg Msg)
view maybeUrl sharedModel model app =
    { title = "Ctrl-R Smoothies"
    , body =
        [ Html.p []
            [ Html.text <| "Welcome " ++ app.data.user.name ++ "!" ]
        , case app.action of
            Just (Err error) ->
                error.errors
                    |> Debug.toString
                    |> Html.text

            Nothing ->
                Html.text "No action"

            _ ->
                Html.text "No errors"
        , Form.renderHtml { method = Form.Post, submitStrategy = Form.TransitionStrategy } app app.data formParser
        ]
    }
