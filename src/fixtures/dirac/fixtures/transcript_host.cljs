(ns dirac.fixtures.transcript-host
  (:require-macros [cljs.core.async.macros :refer [go go-loop]]
                   [dirac.test.settings :refer [get-test-dirac-agent-port get-transcript-match-timeout]])
  (:require [cljs.core.async :refer [put! <! chan timeout alts! close!]]
            [cljs.core.async.impl.protocols :as core-async]
            [dirac.fixtures.transcript :as transcript]
            [chromex.support :refer-macros [oget oset ocall oapply]]
            [chromex.logging :refer-macros [log warn error info]]
            [cuerdas.core :as cuerdas]
            [dirac.fixtures.helpers :as helpers]))

(defonce current-transcript (atom nil))
(defonce last-dirac-frontend-id (atom nil))
(defonce transcript-observers (atom #{}))
(defonce sniffer-enabled (atom true))
(def ^:dynamic *transcript-enabled* true)

(defn add-transcript-observer! [observer]
  (swap! transcript-observers conj observer))

(defn remove-transcript-observer! [observer]
  (swap! transcript-observers disj observer))

(defn init-transcript! [id]
  (let [transcript-el (transcript/create-transcript! (helpers/get-el-by-id id))]
    (reset! current-transcript transcript-el)))

(defn has-transcript? []
  (not (nil? @current-transcript)))

(defn disable-transcript! []
  (set! *transcript-enabled* false))

(defn set-style! [style]
  (ocall js/window "setRunnerFavicon" style)
  (transcript/set-style! @current-transcript style))

(defn sniffer-enabled? []
  @sniffer-enabled)

(defn disable-sniffer! []
  {:pre [(sniffer-enabled?)]}
  (reset! sniffer-enabled false))

(defn enable-sniffer! []
  {:pre [(not (sniffer-enabled?))]}
  (reset! sniffer-enabled false))

(defn call-transcript-sniffer [text]
  (when-let [dirac-frontend-id (second (re-matches #".*register dirac frontend connection #(.*)" text))]
    (reset! last-dirac-frontend-id dirac-frontend-id))
  (doseq [observer @transcript-observers]
    (observer text)))

(defn format-transcript-line [label text]
  {:pre [(string? text)
         (string? label)]}
  (let [padded-type (cuerdas/pad label {:length 16 :type :right})]
    (str padded-type " " text)))

(defn append-to-transcript! [label text & [force?]]
  {:pre [(has-transcript?)
         (string? text)
         (string? label)]}
  (if (sniffer-enabled?)
    (call-transcript-sniffer text))
  (if (or *transcript-enabled* force?)
    (transcript/append-to-transcript! @current-transcript (str (format-transcript-line label text) "\n"))))

(defn read-transcript []
  {:pre [(has-transcript?)]}
  (transcript/read-transcript @current-transcript))

(defn without-transcript-work [worker]
  (binding [*transcript-enabled* false]
    (worker)))

(defn wait-for-transcript-match
  ([re]
   (wait-for-transcript-match re nil))
  ([re time-limit]
   (wait-for-transcript-match re time-limit false))
  ([re time-limit silent?]
   (let [channel (chan)
         observer (fn [self text]
                    (when-let [match (re-matches re text)]
                      (remove-transcript-observer! self)
                      (put! channel match)
                      (close! channel)))]
     (add-transcript-observer! (partial observer observer))
     (go
       (<! (timeout (or time-limit (get-transcript-match-timeout))))
       (when-not (core-async/closed? channel)
         (if silent?
           (do
             (put! channel :timeout)
             (close! channel))
           (do
             (disable-sniffer!)
             (append-to-transcript! "timeout" (str "while waiting for transcript match: " re))
             (throw :task-timeout)))))
     channel)))